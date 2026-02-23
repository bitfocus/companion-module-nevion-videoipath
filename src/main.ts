import { InstanceBase, runEntrypoint, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { Duration, Effect, Exit, Layer, ManagedRuntime } from 'effect'
import equal from 'fast-deep-equal'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { BuildVariableDefinitions, BuildVariableValues, BuildConnectionVariableValues } from './variables.js'
import { BuildActionDefinitions } from './actions.js'
import { UpgradeScripts } from './upgrades.js'
import { BuildFeedbackDefinitions } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { VideoIPathClientTag, VideoIPathConfigTag, makeVideoIPathClient } from './videoipath/client.js'
import { RouterStateTag, makeRouterState } from './videoipath/state.js'
import { createSubscriptionLoop } from './videoipath/subscription.js'
import type { RouterSnapshot } from './videoipath/types.js'
import { ConnectionError, SessionExpiredError } from './videoipath/errors.js'

type AppServices = VideoIPathClientTag | RouterStateTag

export class ModuleInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig
	private runtime: ManagedRuntime.ManagedRuntime<AppServices, never> | null = null
	private lastVarDefs: unknown = null
	private lastActionChoices: unknown = null
	private lastFeedbackChoices: unknown = null

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		this.setFeedbackDefinitions({})
		this.updatePresets()

		// Set initial empty actions and variables
		this.setActionDefinitions({})
		this.setVariableDefinitions([])

		this.startConnection()
	}

	async destroy(): Promise<void> {
		this.log('debug', 'Destroying module instance')
		await this.stopConnection()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		await this.stopConnection()
		this.startConnection()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	private startConnection(): void {
		if (!this.config.host || !this.config.username || !this.config.password) {
			this.updateStatus(InstanceStatus.BadConfig, 'Missing host, username, or password')
			return
		}

		this.updateStatus(InstanceStatus.Connecting)

		// Build layers
		const configLayer = Layer.succeed(VideoIPathConfigTag, {
			host: this.config.host,
			port: this.config.port || 443,
			username: this.config.username,
			password: this.config.password,
			rejectUnauthorized: this.config.rejectUnauthorized ?? false,
		})

		const clientLayer = Layer.effect(VideoIPathClientTag, makeVideoIPathClient).pipe(Layer.provide(configLayer))
		const stateLayer = Layer.effect(RouterStateTag, makeRouterState)
		const appLayer = Layer.mergeAll(clientLayer, stateLayer)

		// The subscription loop runs as a scoped background fiber that retries forever.
		// Errors are handled inside via exponential backoff retry.
		const subscriptionLayer = Layer.scopedDiscard(
			createSubscriptionLoop(
				this.config.pollInterval || 5,
				() => this.onEndpointsChanged(),
				() => this.onConnectionsChanged(),
				() => {
					this.updateStatus(InstanceStatus.Ok)
				},
				(reason) => {
					this.updateStatus(InstanceStatus.ConnectionFailure, reason)
				},
				(level, message) => {
					this.log(level, message)
				},
			).pipe(Effect.catchAll((error) => Effect.die(error))),
		).pipe(Layer.provide(appLayer))

		const fullLayer = Layer.merge(appLayer, subscriptionLayer)

		this.runtime = ManagedRuntime.make(fullLayer)

		// Kick off the runtime (layer construction starts the subscription loop)
		this.runtime.runPromise(Effect.void).catch((err) => {
			const message = err instanceof Error ? err.message : String(err)
			this.log('error', `Runtime initialization failed: ${message}`)
			this.updateStatus(InstanceStatus.ConnectionFailure, message)
		})
	}

	private async stopConnection(): Promise<void> {
		if (this.runtime) {
			try {
				await this.runtime.dispose()
			} catch (err) {
				this.log('debug', `Error during disconnect: ${err instanceof Error ? err.message : String(err)}`)
			}
			this.runtime = null
		}
	}

	/**
	 * Called when endpoint list changes (sources/destinations added/removed/renamed).
	 * This is a definition change — push variable definitions, full variable values, and action definitions.
	 */
	private onEndpointsChanged(): void {
		this.withSnapshot((snapshot) => {
			// Rebuild variable definitions
			const varDefs = BuildVariableDefinitions(snapshot)
			if (!equal(varDefs, this.lastVarDefs)) {
				this.setVariableDefinitions(varDefs)
				this.lastVarDefs = varDefs
			}

			// After a definition change, push full variable values
			const varValues = BuildVariableValues(snapshot)
			this.setVariableValues(varValues)

			// Rebuild action definitions (dropdown choices may have changed)
			const actionDefs = BuildActionDefinitions(this, snapshot)
			const choicesSnapshot = Object.values(actionDefs).map((a) =>
				a?.options?.map((o) => ('choices' in o ? o.choices : null)),
			)
			if (!equal(choicesSnapshot, this.lastActionChoices)) {
				this.setActionDefinitions(actionDefs)
				this.lastActionChoices = choicesSnapshot
			}

			// Rebuild feedback definitions (choices may have changed)
			const feedbackDefs = BuildFeedbackDefinitions(this, snapshot)
			const feedbackChoicesSnapshot = Object.values(feedbackDefs).map((f) =>
				f?.options?.map((o) => ('choices' in o ? o.choices : null)),
			)
			if (!equal(feedbackChoicesSnapshot, this.lastFeedbackChoices)) {
				this.setFeedbackDefinitions(feedbackDefs)
				this.lastFeedbackChoices = feedbackChoicesSnapshot
			}
			this.checkFeedbacks()

			this.log('debug', `Endpoints changed: ${snapshot.endpoints.size} endpoints`)
		})
	}

	/**
	 * Called when connections change (routes made/broken).
	 * This is a value-only change — push only the connection-related variable deltas.
	 */
	private onConnectionsChanged(): void {
		this.withSnapshot((snapshot) => {
			const varValues = BuildConnectionVariableValues(snapshot)
			this.setVariableValues(varValues)

			// Rebuild feedback definitions with fresh connection state and re-evaluate
			this.setFeedbackDefinitions(BuildFeedbackDefinitions(this, snapshot))
			this.checkFeedbacks()

			this.log('debug', `Connections changed: ${snapshot.connections.size} connections`)
		})
	}

	private withSnapshot(fn: (snapshot: RouterSnapshot) => void): void {
		if (!this.runtime) return

		this.runtime
			.runPromise(
				Effect.gen(function* () {
					const state = yield* RouterStateTag
					return yield* state.getSnapshot()
				}),
			)
			.then(fn)
			.catch((err) => {
				this.log('error', `Failed to sync state: ${err instanceof Error ? err.message : String(err)}`)
			})
	}

	async executeRoute(
		source: string,
		destination: string,
	): Promise<Exit.Exit<void, ConnectionError | SessionExpiredError>> {
		if (!this.runtime) {
			return Exit.fail(new ConnectionError({ message: 'Not connected to VideoIPath', from: source, to: destination }))
		}

		return this.runtime.runPromiseExit(
			Effect.gen(function* () {
				const client = yield* VideoIPathClientTag
				yield* client.connect(source, destination)
			}).pipe(
				Effect.asVoid,
				Effect.timeout(Duration.seconds(30)),
				Effect.catchTag('TimeoutException', () =>
					Effect.fail(
						new ConnectionError({
							message: 'Route request timed out after 30 seconds',
							from: source,
							to: destination,
						}),
					),
				),
			),
		)
	}

	async executeDisconnect(destination: string): Promise<Exit.Exit<void, ConnectionError | SessionExpiredError>> {
		if (!this.runtime) {
			return Exit.fail(new ConnectionError({ message: 'Not connected to VideoIPath', from: '', to: destination }))
		}

		return this.runtime.runPromiseExit(
			Effect.gen(function* () {
				const state = yield* RouterStateTag
				const connection = yield* state.getConnectionForDestination(destination)

				if (!connection) {
					return yield* new ConnectionError({
						message: 'No active connection found for destination',
						from: '',
						to: destination,
					})
				}

				const client = yield* VideoIPathClientTag
				yield* client.disconnect(connection.id, connection.rev)
			}).pipe(
				Effect.asVoid,
				Effect.timeout(Duration.seconds(30)),
				Effect.catchTag('TimeoutException', () =>
					Effect.fail(
						new ConnectionError({
							message: 'Disconnect request timed out after 30 seconds',
							from: '',
							to: destination,
						}),
					),
				),
			),
		)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)

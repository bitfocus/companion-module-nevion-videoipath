import { InstanceBase, runEntrypoint, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { BuildVariableDefinitions, BuildVariableValues, BuildConnectionVariableValues } from './variables.js'
import { BuildActionDefinitions } from './actions.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { VideoIPathClientTag, VideoIPathConfigTag, makeVideoIPathClient } from './videoipath/client.js'
import { RouterStateTag, makeRouterState } from './videoipath/state.js'
import { createSubscriptionLoop } from './videoipath/subscription.js'
import type { RouterSnapshot } from './videoipath/types.js'

type AppServices = VideoIPathClientTag | RouterStateTag

export class ModuleInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig
	private runtime: ManagedRuntime.ManagedRuntime<AppServices, never> | null = null
	private lastVarDefsKey = ''
	private lastActionDefsKey = ''

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		this.updateFeedbacks()
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
			const varDefsKey = JSON.stringify(varDefs)
			if (varDefsKey !== this.lastVarDefsKey) {
				this.setVariableDefinitions(varDefs)
				this.lastVarDefsKey = varDefsKey
			}

			// After a definition change, push full variable values
			const varValues = BuildVariableValues(snapshot)
			this.setVariableValues(varValues)

			// Rebuild action definitions (dropdown choices may have changed)
			const actionDefs = BuildActionDefinitions(this, snapshot)
			const actionDefsKey = JSON.stringify(
				Object.values(actionDefs).map((a) => a?.options?.map((o) => ('choices' in o ? o.choices : null))),
			)
			if (actionDefsKey !== this.lastActionDefsKey) {
				this.setActionDefinitions(actionDefs)
				this.lastActionDefsKey = actionDefsKey
			}

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

	async executeRoute(source: string, destination: string): Promise<void> {
		if (!this.runtime) {
			throw new Error('Not connected to VideoIPath')
		}

		await this.runtime.runPromise(
			Effect.gen(function* () {
				const client = yield* VideoIPathClientTag
				yield* client.connect(source, destination)
			}),
		)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)

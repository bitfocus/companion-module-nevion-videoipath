import { Duration, Effect, Schedule, Scope } from 'effect'
import type { Endpoint, Connection } from './types.js'
import { SubscriptionError } from './errors.js'
import { VideoIPathClientTag } from './client.js'
import { RouterStateTag } from './state.js'

// Subscription paths for the VideoIPath API
const ENDPOINTS_SUBSCRIPTION_PATH = '/status/conman/endpoints/**'
const SERVICES_SUBSCRIPTION_PATH = '/status/conman/services/*/connection/from,to,generic,id,rev,humanReadableId/**'

// Parse endpoints from the raw API response data
export const parseEndpoints = (data: unknown): Map<string, Endpoint> => {
	const endpoints = new Map<string, Endpoint>()

	try {
		const root = data as Record<string, unknown>
		const dataNode = (root?.data ?? root) as Record<string, unknown>
		const statusNode = (dataNode?.status ?? dataNode) as Record<string, unknown>
		const conmanNode = (statusNode?.conman ?? statusNode) as Record<string, unknown>
		const endpointsNode = (conmanNode?.endpoints ?? conmanNode) as Record<string, unknown>

		if (!endpointsNode || typeof endpointsNode !== 'object') return endpoints

		for (const [epId, epData] of Object.entries(endpointsNode)) {
			if (!epData || typeof epData !== 'object') continue
			const ep = epData as Record<string, unknown>

			// Only include vertex endpoints (normal endpoints)
			const specific = ep.specific as Record<string, unknown> | undefined
			const specificType = specific?.type as string | undefined
			if (specificType && specificType !== 'vertex') continue

			const generic = ep.generic as Record<string, unknown> | undefined
			const descriptor = generic?.descriptor as Record<string, unknown> | undefined
			const label = (descriptor?.label as string) ?? epId
			const id = (generic?.id as string) ?? epId

			const endpointType = ep.endpointType as string | undefined
			if (!endpointType || !['src', 'dst', 'both'].includes(endpointType)) continue

			endpoints.set(id, {
				id,
				label,
				endpointType: endpointType as 'src' | 'dst' | 'both',
			})
		}
	} catch {
		// Return whatever we managed to parse
	}

	return endpoints
}

// Parse services/connections from the raw API response data
export const parseConnections = (data: unknown): Map<string, Connection> => {
	const connections = new Map<string, Connection>()

	try {
		const root = data as Record<string, unknown>
		const dataNode = (root?.data ?? root) as Record<string, unknown>
		const statusNode = (dataNode?.status ?? dataNode) as Record<string, unknown>
		const conmanNode = (statusNode?.conman ?? statusNode) as Record<string, unknown>
		const servicesNode = (conmanNode?.services ?? conmanNode) as Record<string, unknown>

		if (!servicesNode || typeof servicesNode !== 'object') return connections

		for (const [svcId, svcData] of Object.entries(servicesNode)) {
			if (!svcData || typeof svcData !== 'object') continue
			const svc = svcData as Record<string, unknown>

			// Services have a connection sub-object
			const conn = (svc.connection ?? svc) as Record<string, unknown>

			const from = conn.from as string | undefined
			const to = conn.to as string | undefined
			const id = (conn.id as string) ?? svcId
			const rev = (conn.rev as string) ?? ''

			if (!from || !to) continue

			const generic = conn.generic as Record<string, unknown> | undefined
			const state = (generic?.state as string) ?? 'unknown'
			const descriptor = generic?.descriptor as Record<string, unknown> | undefined
			const label = (descriptor?.label as string) ?? `${from} -> ${to}`

			connections.set(id, { id, rev, from, to, state, label })
		}
	} catch {
		// Return whatever we managed to parse
	}

	return connections
}

// Apply subscription delta to endpoints
const applyEndpointDelta = (current: ReadonlyMap<string, Endpoint>, delta: unknown): ReadonlyMap<string, Endpoint> => {
	const updated = new Map(current)

	try {
		const root = delta as Record<string, unknown>
		if (!root || typeof root !== 'object') return current

		// Walk to endpoints node in delta
		const dataNode = (root?.data ?? root) as Record<string, unknown>
		const statusNode = (dataNode?.status ?? dataNode) as Record<string, unknown>
		const conmanNode = (statusNode?.conman ?? statusNode) as Record<string, unknown>
		const endpointsNode = (conmanNode?.endpoints ?? conmanNode) as Record<string, unknown>

		if (!endpointsNode || typeof endpointsNode !== 'object') return current

		for (const [epId, epData] of Object.entries(endpointsNode)) {
			if (!epData || typeof epData !== 'object') {
				continue
			}

			const ep = epData as Record<string, unknown>
			const event = ep._e as string | undefined

			if (event === 'd') {
				updated.delete(epId)
				for (const key of updated.keys()) {
					if (key === epId || key.endsWith(`:${epId}`)) {
						updated.delete(key)
					}
				}
				continue
			}

			if (event === 'e') {
				continue
			}

			// Update or full refresh - parse the endpoint data
			const parsed = parseEndpoints({ [epId]: epData })
			for (const [id, endpoint] of parsed) {
				updated.set(id, endpoint)
			}
		}
	} catch {
		// On parse error, return current state
	}

	return updated
}

// Apply subscription delta to connections
const applyConnectionDelta = (
	current: ReadonlyMap<string, Connection>,
	delta: unknown,
): ReadonlyMap<string, Connection> => {
	const updated = new Map(current)

	try {
		const root = delta as Record<string, unknown>
		if (!root || typeof root !== 'object') return current

		const dataNode = (root?.data ?? root) as Record<string, unknown>
		const statusNode = (dataNode?.status ?? dataNode) as Record<string, unknown>
		const conmanNode = (statusNode?.conman ?? statusNode) as Record<string, unknown>
		const servicesNode = (conmanNode?.services ?? conmanNode) as Record<string, unknown>

		if (!servicesNode || typeof servicesNode !== 'object') return current

		for (const [svcId, svcData] of Object.entries(servicesNode)) {
			if (!svcData || typeof svcData !== 'object') {
				continue
			}

			const svc = svcData as Record<string, unknown>
			const event = svc._e as string | undefined

			if (event === 'd') {
				updated.delete(svcId)
				for (const key of updated.keys()) {
					if (key === svcId || key.endsWith(`:${svcId}`)) {
						updated.delete(key)
					}
				}
				continue
			}

			if (event === 'e') {
				continue
			}

			const parsed = parseConnections({ [svcId]: svcData })
			for (const [id, connection] of parsed) {
				updated.set(id, connection)
			}
		}
	} catch {
		// On parse error, return current state
	}

	return updated
}

// Retry schedule: exponential backoff capped at 30 seconds, retries forever
const reconnectSchedule = Schedule.exponential('1 second', 2).pipe(
	Schedule.modifyDelay(Duration.min('30 seconds')),
	Schedule.jittered,
)

/**
 * Creates the full lifecycle as a single scoped Effect that runs forever.
 * When the scope closes (module destroy), everything is cleaned up.
 */
export const createSubscriptionLoop = (
	pollIntervalSeconds: number,
	onEndpointsChanged: () => void,
	onConnectionsChanged: () => void,
	onConnected: () => void,
	onDisconnected: (reason: string) => void,
	onLog: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void,
): Effect.Effect<void, never, VideoIPathClientTag | RouterStateTag | Scope.Scope> =>
	Effect.gen(function* () {
		const client = yield* VideoIPathClientTag
		const state = yield* RouterStateTag

		// One full session: login -> subscribe -> poll until error
		const runSession: Effect.Effect<void, SubscriptionError> = Effect.gen(function* () {
			onLog('info', 'Connecting to VideoIPath...')

			// Login
			yield* client
				.login()
				.pipe(Effect.mapError((e) => new SubscriptionError({ message: `Login failed: ${e.message}`, cause: e })))
			onLog('info', 'Authenticated successfully')

			// Track subscriptions for cleanup
			let endpointSubId: string | null = null
			let serviceSubId: string | null = null

			const cleanup = Effect.gen(function* () {
				if (endpointSubId) yield* client.deleteSubscription(endpointSubId).pipe(Effect.ignore)
				if (serviceSubId) yield* client.deleteSubscription(serviceSubId).pipe(Effect.ignore)
				yield* client.logout()
				onLog('debug', 'Session cleaned up')
			})

			yield* Effect.ensuring(
				Effect.gen(function* () {
					// Create endpoint subscription
					const epSub = yield* client.createSubscription(ENDPOINTS_SUBSCRIPTION_PATH).pipe(
						Effect.mapError(
							(e) =>
								new SubscriptionError({
									message: `Failed to create endpoint subscription: ${e.message}`,
									cause: e,
								}),
						),
					)
					endpointSubId = epSub.id
					const initialEndpoints = parseEndpoints(epSub.data)
					yield* state.setEndpoints(initialEndpoints)
					onLog('debug', `Loaded ${initialEndpoints.size} endpoints`)

					// Create services subscription
					const svcSub = yield* client.createSubscription(SERVICES_SUBSCRIPTION_PATH).pipe(
						Effect.mapError(
							(e) =>
								new SubscriptionError({
									message: `Failed to create service subscription: ${e.message}`,
									cause: e,
								}),
						),
					)
					serviceSubId = svcSub.id
					const initialConnections = parseConnections(svcSub.data)
					yield* state.setConnections(initialConnections)
					onLog('debug', `Loaded ${initialConnections.size} connections`)

					// We're connected — push full state
					onConnected()
					onEndpointsChanged()
					onConnectionsChanged()

					// Poll loop - runs until an error triggers reconnection
					const pollOnce = Effect.gen(function* () {
						let endpointsChanged = false
						let connectionsChanged = false

						if (endpointSubId) {
							const delta = yield* client.pollSubscription(endpointSubId).pipe(
								Effect.mapError(
									(e) =>
										new SubscriptionError({
											message: `Endpoint poll failed: ${e.message}`,
											subscriptionId: endpointSubId!,
											cause: e,
										}),
								),
							)
							if (delta !== null && delta !== undefined) {
								yield* state.updateEndpoints((current) => applyEndpointDelta(current, delta))
								endpointsChanged = true
							}
						}

						if (serviceSubId) {
							const delta = yield* client.pollSubscription(serviceSubId).pipe(
								Effect.mapError(
									(e) =>
										new SubscriptionError({
											message: `Service poll failed: ${e.message}`,
											subscriptionId: serviceSubId!,
											cause: e,
										}),
								),
							)
							if (delta !== null && delta !== undefined) {
								yield* state.updateConnections((current) => applyConnectionDelta(current, delta))
								connectionsChanged = true
							}
						}

						if (endpointsChanged) onEndpointsChanged()
						if (connectionsChanged) onConnectionsChanged()
					})

					// Poll forever with fixed interval
					yield* pollOnce.pipe(Effect.repeat(Schedule.spaced(`${pollIntervalSeconds} seconds`)))
				}),
				cleanup,
			)
		}).pipe(
			Effect.catchAll((error) => {
				onDisconnected(error.message)
				onLog('warn', `Connection lost: ${error.message}. Will retry...`)
				return Effect.fail(error)
			}),
		)

		// Fork the session with infinite retry into a background fiber tied to this scope
		yield* Effect.forkScoped(runSession.pipe(Effect.retry(reconnectSchedule)))
	})

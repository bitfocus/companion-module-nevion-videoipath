import { Context, Effect, Ref } from 'effect'
import type { Endpoint, Connection, RouterSnapshot } from './types.js'

export interface RouterState {
	readonly getSnapshot: () => Effect.Effect<RouterSnapshot>
	readonly getSources: () => Effect.Effect<ReadonlyArray<Endpoint>>
	readonly getDestinations: () => Effect.Effect<ReadonlyArray<Endpoint>>
	readonly getEndpoints: () => Effect.Effect<ReadonlyMap<string, Endpoint>>
	readonly getConnections: () => Effect.Effect<ReadonlyArray<Connection>>
	readonly getConnectionsMap: () => Effect.Effect<ReadonlyMap<string, Connection>>
	readonly getConnectionForDestination: (destId: string) => Effect.Effect<Connection | null>
	readonly setEndpoints: (endpoints: ReadonlyMap<string, Endpoint>) => Effect.Effect<void>
	readonly setConnections: (connections: ReadonlyMap<string, Connection>) => Effect.Effect<void>
	readonly updateEndpoints: (
		fn: (current: ReadonlyMap<string, Endpoint>) => ReadonlyMap<string, Endpoint>,
	) => Effect.Effect<void>
	readonly updateConnections: (
		fn: (current: ReadonlyMap<string, Connection>) => ReadonlyMap<string, Connection>,
	) => Effect.Effect<void>
}

export class RouterStateTag extends Context.Tag('RouterState')<RouterStateTag, RouterState>() {}

export const makeRouterState = Effect.gen(function* () {
	const endpointsRef = yield* Ref.make<ReadonlyMap<string, Endpoint>>(new Map())
	const connectionsRef = yield* Ref.make<ReadonlyMap<string, Connection>>(new Map())

	const getSnapshot = (): Effect.Effect<RouterSnapshot> =>
		Effect.all({
			endpoints: Ref.get(endpointsRef),
			connections: Ref.get(connectionsRef),
		})

	const getSources = (): Effect.Effect<ReadonlyArray<Endpoint>> =>
		Ref.get(endpointsRef).pipe(
			Effect.map((endpoints) =>
				Array.from(endpoints.values()).filter((ep) => ep.endpointType === 'src' || ep.endpointType === 'both'),
			),
		)

	const getDestinations = (): Effect.Effect<ReadonlyArray<Endpoint>> =>
		Ref.get(endpointsRef).pipe(
			Effect.map((endpoints) =>
				Array.from(endpoints.values()).filter((ep) => ep.endpointType === 'dst' || ep.endpointType === 'both'),
			),
		)

	const getEndpoints = (): Effect.Effect<ReadonlyMap<string, Endpoint>> => Ref.get(endpointsRef)

	const getConnections = (): Effect.Effect<ReadonlyArray<Connection>> =>
		Ref.get(connectionsRef).pipe(Effect.map((connections) => Array.from(connections.values())))

	const getConnectionsMap = (): Effect.Effect<ReadonlyMap<string, Connection>> => Ref.get(connectionsRef)

	const getConnectionForDestination = (destId: string): Effect.Effect<Connection | null> =>
		Ref.get(connectionsRef).pipe(
			Effect.map((connections) => {
				for (const conn of connections.values()) {
					if (conn.to === destId) return conn
				}
				return null
			}),
		)

	const setEndpoints = (endpoints: ReadonlyMap<string, Endpoint>): Effect.Effect<void> =>
		Ref.set(endpointsRef, endpoints)

	const setConnections = (connections: ReadonlyMap<string, Connection>): Effect.Effect<void> =>
		Ref.set(connectionsRef, connections)

	const updateEndpoints = (
		fn: (current: ReadonlyMap<string, Endpoint>) => ReadonlyMap<string, Endpoint>,
	): Effect.Effect<void> => Ref.update(endpointsRef, fn)

	const updateConnections = (
		fn: (current: ReadonlyMap<string, Connection>) => ReadonlyMap<string, Connection>,
	): Effect.Effect<void> => Ref.update(connectionsRef, fn)

	return {
		getSnapshot,
		getSources,
		getDestinations,
		getEndpoints,
		getConnections,
		getConnectionsMap,
		getConnectionForDestination,
		setEndpoints,
		setConnections,
		updateEndpoints,
		updateConnections,
	} satisfies RouterState
})

import type { CompanionVariableDefinition, CompanionVariableValues } from '@companion-module/base'
import { makeCompanionId } from './videoipath/types.js'
import type { Connection, RouterSnapshot } from './videoipath/types.js'

export function BuildVariableDefinitions(snapshot: RouterSnapshot): CompanionVariableDefinition[] {
	const defs: CompanionVariableDefinition[] = []

	for (const ep of snapshot.endpoints.values()) {
		if (ep.endpointType === 'src' || ep.endpointType === 'both') {
			const id = makeCompanionId('src', ep.id)
			defs.push({
				variableId: `${id}_label`,
				name: `Source: ${ep.label} (Label)`,
			})
		}

		if (ep.endpointType === 'dst' || ep.endpointType === 'both') {
			const id = makeCompanionId('dst', ep.id)
			defs.push({
				variableId: `${id}_label`,
				name: `Destination: ${ep.label} (Label)`,
			})
			defs.push({
				variableId: `${id}_source_id`,
				name: `Destination: ${ep.label} (Routed Source ID)`,
			})
		}
	}

	return defs
}

/** Build ALL variable values (labels + connection routes). Used after endpoint definition changes. */
export function BuildVariableValues(snapshot: RouterSnapshot): CompanionVariableValues {
	const values: CompanionVariableValues = {}

	const destConnections = buildDestConnectionLookup(snapshot)

	for (const ep of snapshot.endpoints.values()) {
		if (ep.endpointType === 'src' || ep.endpointType === 'both') {
			const id = makeCompanionId('src', ep.id)
			values[`${id}_label`] = ep.label
		}

		if (ep.endpointType === 'dst' || ep.endpointType === 'both') {
			const id = makeCompanionId('dst', ep.id)
			values[`${id}_label`] = ep.label
			const from = destConnections.get(ep.id)?.from
			values[`${id}_source_id`] = from ? makeCompanionId('src', from) : ''
		}
	}

	return values
}

/** Build only the connection-route variable values (delta). Used when only connections change. */
export function BuildConnectionVariableValues(snapshot: RouterSnapshot): CompanionVariableValues {
	const values: CompanionVariableValues = {}

	const destConnections = buildDestConnectionLookup(snapshot)

	for (const ep of snapshot.endpoints.values()) {
		if (ep.endpointType === 'dst' || ep.endpointType === 'both') {
			const id = makeCompanionId('dst', ep.id)
			const from = destConnections.get(ep.id)?.from
			values[`${id}_source_id`] = from ? makeCompanionId('src', from) : ''
		}
	}

	return values
}

function buildDestConnectionLookup(snapshot: RouterSnapshot): Map<string, Connection> {
	const lookup = new Map<string, Connection>()
	for (const conn of snapshot.connections.values()) {
		lookup.set(conn.to, conn)
	}
	return lookup
}

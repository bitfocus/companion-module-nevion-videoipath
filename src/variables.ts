import type { CompanionVariableDefinition, CompanionVariableValues } from '@companion-module/base'
import type { Connection, RouterSnapshot } from './videoipath/types.js'

const sanitizeId = (id: string): string => id.replace(/[^a-zA-Z0-9]/g, '_')

export function BuildVariableDefinitions(snapshot: RouterSnapshot): CompanionVariableDefinition[] {
	const defs: CompanionVariableDefinition[] = []

	for (const ep of snapshot.endpoints.values()) {
		const safeId = sanitizeId(ep.id)

		if (ep.endpointType === 'src' || ep.endpointType === 'both') {
			defs.push({
				variableId: `src_${safeId}_label`,
				name: `Source: ${ep.label} (Label)`,
			})
		}

		if (ep.endpointType === 'dst' || ep.endpointType === 'both') {
			defs.push({
				variableId: `dst_${safeId}_label`,
				name: `Destination: ${ep.label} (Label)`,
			})
			defs.push({
				variableId: `dst_${safeId}_source_id`,
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
		const safeId = sanitizeId(ep.id)

		if (ep.endpointType === 'src' || ep.endpointType === 'both') {
			values[`src_${safeId}_label`] = ep.label
		}

		if (ep.endpointType === 'dst' || ep.endpointType === 'both') {
			values[`dst_${safeId}_label`] = ep.label
			values[`dst_${safeId}_source_id`] = destConnections.get(ep.id)?.from ?? ''
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
			values[`dst_${sanitizeId(ep.id)}_source_id`] = destConnections.get(ep.id)?.from ?? ''
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

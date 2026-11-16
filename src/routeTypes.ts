import type { DropdownChoice } from '@companion-module/base'
import { CONFIGURABLE_TYPES } from './config.js'
import { VERTEX_FORMATS, makeCompanionId } from './videoipath/types.js'
import type { Endpoint, RouterSnapshot } from './videoipath/types.js'

const TYPE_LABELS: Record<string, string> = {
	vertex: 'Other Vertex',
	vertex_video: 'Video Vertex',
	vertex_audio: 'Audio Vertex',
	vertex_ancillary: 'Ancillary Vertex',
	vertex_asi: 'ASI Vertex',
	gpio: 'GPIO',
	tallyMeta: 'Tally',
	group: 'Group',
	junction: 'Junction',
	leader: 'Leader',
	follower: 'Follower',
}

const TYPE_DESCRIPTIONS: Record<string, string> = {
	vertex: 'Vertices that VideoIPath reports no single codec format for',
}

export interface RouteType {
	/** Suffix of the action and feedback ids */
	readonly type: string
	readonly label: string
	readonly description: string | undefined
	readonly sourceChoices: DropdownChoice[]
	readonly sourceLookup: ReadonlyMap<string, string>
	readonly destChoices: DropdownChoice[]
	readonly destLookup: ReadonlyMap<string, string>
}

const VERTEX_ROUTE_TYPES: ReadonlySet<string> = new Set([
	'vertex',
	...VERTEX_FORMATS.map((format) => `vertex_${format}`),
])

/** Vertices are split by codec format; a vertex without a single format stays under `vertex` */
export const getRouteType = (ep: Endpoint): string =>
	ep.specificType === 'vertex' && ep.format ? `vertex_${ep.format}` : ep.specificType

const isSource = (ep: Endpoint): boolean => ep.endpointType === 'src' || ep.endpointType === 'both'
const isDestination = (ep: Endpoint): boolean => ep.endpointType === 'dst' || ep.endpointType === 'both'

function buildChoices(endpoints: ReadonlyArray<Endpoint>, direction: 'src' | 'dst'): DropdownChoice[] {
	return endpoints
		.slice()
		.sort((a, b) => a.label.localeCompare(b.label))
		.map((ep) => ({ id: makeCompanionId(direction, ep.id), label: ep.label }))
}

function buildIdLookup(endpoints: ReadonlyArray<Endpoint>, direction: 'src' | 'dst'): Map<string, string> {
	return new Map(endpoints.map((ep) => [makeCompanionId(direction, ep.id), ep.id]))
}

export function BuildRouteTypes(snapshot: RouterSnapshot): RouteType[] {
	const allEndpoints = Array.from(snapshot.endpoints.values())

	// Union of configurable types, vertex formats and types discovered in the data
	const types = new Set<string>([...CONFIGURABLE_TYPES, ...VERTEX_ROUTE_TYPES])
	for (const ep of allEndpoints) types.add(getRouteType(ep))

	const vertices = allEndpoints.filter((ep) => ep.specificType === 'vertex')

	return Array.from(types, (type) => {
		const endpoints = allEndpoints.filter((ep) => getRouteType(ep) === type)
		// Every vertex route resolves every vertex, so a saved selection survives a format change,
		// and selections from before the split by format keep working under `vertex`
		const lookupEndpoints = VERTEX_ROUTE_TYPES.has(type) ? vertices : endpoints

		return {
			type,
			label: TYPE_LABELS[type] ?? type,
			description: TYPE_DESCRIPTIONS[type],
			sourceChoices: buildChoices(endpoints.filter(isSource), 'src'),
			sourceLookup: buildIdLookup(lookupEndpoints.filter(isSource), 'src'),
			destChoices: buildChoices(endpoints.filter(isDestination), 'dst'),
			destLookup: buildIdLookup(lookupEndpoints.filter(isDestination), 'dst'),
		}
	})
}

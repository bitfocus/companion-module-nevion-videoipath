import type { CompanionFeedbackDefinitions, DropdownChoice } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import { CONFIGURABLE_TYPES } from './config.js'
import { makeCompanionId } from './videoipath/types.js'
import type { Endpoint, RouterSnapshot } from './videoipath/types.js'

function buildChoices(
	endpoints: ReadonlyArray<Endpoint>,
	direction: 'src' | 'dst',
): { choices: DropdownChoice[]; idLookup: Map<string, string> } {
	const choices: DropdownChoice[] = []
	const idLookup = new Map<string, string>()

	const sorted = endpoints.slice().sort((a, b) => a.label.localeCompare(b.label))
	for (const ep of sorted) {
		const companionId = makeCompanionId(direction, ep.id)
		choices.push({ id: companionId, label: ep.label })
		idLookup.set(companionId, ep.id)
	}

	return { choices, idLookup }
}

const TYPE_LABELS: Record<string, string> = {
	vertex: 'Video/Audio',
	gpio: 'GPIO',
	tallyMeta: 'Tally',
	group: 'Group',
	junction: 'Junction',
	leader: 'Leader',
	follower: 'Follower',
}

function getLabelForType(type: string): string {
	return TYPE_LABELS[type] ?? type
}

/** Build a dest→source lookup from connections. Exported for use in main.ts. */
export function buildDestToSourceLookup(snapshot: RouterSnapshot): ReadonlyMap<string, string> {
	const lookup = new Map<string, string>()
	for (const conn of snapshot.connections.values()) {
		lookup.set(conn.to, conn.from)
	}
	return lookup
}

export function BuildFeedbackDefinitions(
	snapshot: RouterSnapshot,
	getDestToSourceLookup: () => ReadonlyMap<string, string>,
): CompanionFeedbackDefinitions {
	const allEndpoints = Array.from(snapshot.endpoints.values())

	// Union of configurable types + types discovered in the data
	const allTypes = new Set<string>(CONFIGURABLE_TYPES)
	for (const ep of allEndpoints) {
		allTypes.add(ep.specificType)
	}

	const feedbacks: CompanionFeedbackDefinitions = {}

	for (const type of allTypes) {
		const sources = allEndpoints.filter(
			(ep) => ep.specificType === type && (ep.endpointType === 'src' || ep.endpointType === 'both'),
		)
		const destinations = allEndpoints.filter(
			(ep) => ep.specificType === type && (ep.endpointType === 'dst' || ep.endpointType === 'both'),
		)

		const { choices: sourceChoices, idLookup: sourceLookup } = buildChoices(sources, 'src')
		const { choices: destChoices, idLookup: destLookup } = buildChoices(destinations, 'dst')
		const label = getLabelForType(type)

		const sourceChoicesWithDisconnected: DropdownChoice[] = [
			{ id: 'disconnected', label: '(Disconnected)' },
			...sourceChoices,
		]

		feedbacks[`route_match_${type}`] = {
			type: 'boolean',
			name: `Route Match ${label}`,
			description: `Change style when the selected source is routed to the selected destination (${label})`,
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					choices: sourceChoicesWithDisconnected,
					default: sourceChoicesWithDisconnected[0]?.id ?? '',
				},
				{
					id: 'destination',
					type: 'dropdown',
					label: 'Destination',
					choices: destChoices,
					default: destChoices[0]?.id ?? '',
				},
			],
			defaultStyle: {
				bgcolor: combineRgb(255, 255, 0),
				color: combineRgb(0, 0, 0),
			},
			callback: (feedback) => {
				const rawSource = feedback.options.source as string
				const destApiId = destLookup.get(feedback.options.destination as string)
				if (!destApiId) return false

				const lookup = getDestToSourceLookup()

				if (rawSource === 'disconnected') {
					return !lookup.has(destApiId)
				}

				const sourceApiId = sourceLookup.get(rawSource)
				if (!sourceApiId) return false

				return lookup.get(destApiId) === sourceApiId
			},
		}
	}

	return feedbacks
}

import type { CompanionFeedbackDefinitions, DropdownChoice } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import type { ModuleConfig } from './config.js'
import type { ModuleInstance } from './main.js'
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

export function BuildFeedbackDefinitions(self: ModuleInstance, snapshot: RouterSnapshot): CompanionFeedbackDefinitions {
	const allEndpoints = Array.from(snapshot.endpoints.values())

	// Build a lookup: destination ID -> source ID currently routed to it
	const destToSourceLookup = new Map<string, string>()
	for (const conn of snapshot.connections.values()) {
		destToSourceLookup.set(conn.to, conn.from)
	}

	// Discover which specific types exist
	const typesWithEndpoints = new Set<string>()
	for (const ep of allEndpoints) {
		typesWithEndpoints.add(ep.specificType)
	}

	const feedbacks: CompanionFeedbackDefinitions = {}

	for (const type of typesWithEndpoints) {
		const configKey = `enable${type.charAt(0).toUpperCase()}${type.slice(1)}` as keyof ModuleConfig
		if (self.config[configKey] === false) continue

		const sources = allEndpoints.filter(
			(ep) => ep.specificType === type && (ep.endpointType === 'src' || ep.endpointType === 'both'),
		)
		const destinations = allEndpoints.filter(
			(ep) => ep.specificType === type && (ep.endpointType === 'dst' || ep.endpointType === 'both'),
		)

		if (sources.length === 0 || destinations.length === 0) continue

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

				if (rawSource === 'disconnected') {
					return !destToSourceLookup.has(destApiId)
				}

				const sourceApiId = sourceLookup.get(rawSource)
				if (!sourceApiId) return false

				const routedSource = destToSourceLookup.get(destApiId)
				return routedSource === sourceApiId
			},
		}
	}

	return feedbacks
}

import type { CompanionFeedbackDefinitions, DropdownChoice } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import { BuildRouteTypes } from './routeTypes.js'
import type { RouterSnapshot } from './videoipath/types.js'

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
	const feedbacks: CompanionFeedbackDefinitions = {}

	for (const { type, label, sourceChoices, sourceLookup, destChoices, destLookup } of BuildRouteTypes(snapshot)) {
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

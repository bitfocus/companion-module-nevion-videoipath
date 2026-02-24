import type { CompanionActionDefinitions, DropdownChoice } from '@companion-module/base'
import { Cause, Exit } from 'effect'
import { CONFIGURABLE_TYPES } from './config.js'
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

export function BuildActionDefinitions(self: ModuleInstance, snapshot: RouterSnapshot): CompanionActionDefinitions {
	const allEndpoints = Array.from(snapshot.endpoints.values())

	// Union of configurable types + types discovered in the data
	const allTypes = new Set<string>(CONFIGURABLE_TYPES)
	for (const ep of allEndpoints) {
		allTypes.add(ep.specificType)
	}

	const actions: CompanionActionDefinitions = {}

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

		const sourceChoicesWithDisconnect: DropdownChoice[] = [
			{ id: 'disconnect', label: '(Disconnect)' },
			...sourceChoices,
		]

		actions[`route_${type}`] = {
			name: `Route ${label}`,
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					choices: sourceChoicesWithDisconnect,
					default: sourceChoicesWithDisconnect[0]?.id ?? '',
				},
				{
					id: 'destination',
					type: 'dropdown',
					label: 'Destination',
					choices: destChoices,
					default: destChoices[0]?.id ?? '',
				},
				{
					id: 'conflictStrategy',
					type: 'dropdown',
					label: 'Conflict Strategy',
					choices: [
						{ id: '0', label: 'No strategy' },
						{ id: '1', label: 'Cancel destination' },
						{ id: '2', label: 'Un-allocate source and destination' },
					],
					default: '1',
				},
			],
			callback: async (event) => {
				try {
					const rawSource = event.options.source as string
					const rawDest = event.options.destination as string
					const conflictStrategy = Number(event.options.conflictStrategy ?? '1')

					if (!rawSource || !rawDest) {
						self.log('warn', `Route ${label} action missing source or destination`)
						return
					}

					const destination = destLookup.get(rawDest) ?? rawDest

					if (rawSource === 'disconnect') {
						self.log('info', `Route ${label}: requesting disconnect on ${destination}`)
						const start = Date.now()

						const result = await self.executeDisconnect(destination, conflictStrategy)

						if (Exit.isSuccess(result)) {
							self.log('info', `Route ${label}: disconnect on ${destination} successful (${Date.now() - start}ms)`)
						} else {
							const failure = Cause.failureOption(result.cause)
							const message = failure._tag === 'Some' ? failure.value.message : Cause.pretty(result.cause)
							self.log(
								'error',
								`Route ${label}: disconnect on ${destination} failed after ${Date.now() - start}ms: ${message}`,
							)
						}
					} else {
						const source = sourceLookup.get(rawSource) ?? rawSource

						self.log('info', `Route ${label}: requesting ${source} -> ${destination}`)
						const start = Date.now()

						const result = await self.executeRoute(source, destination, conflictStrategy)

						if (Exit.isSuccess(result)) {
							self.log('info', `Route ${label}: ${source} -> ${destination} successful (${Date.now() - start}ms)`)
						} else {
							const failure = Cause.failureOption(result.cause)
							const message = failure._tag === 'Some' ? failure.value.message : Cause.pretty(result.cause)
							self.log(
								'error',
								`Route ${label}: ${source} -> ${destination} failed after ${Date.now() - start}ms: ${message}`,
							)
						}
					}
				} catch (err) {
					self.log(
						'error',
						`Route ${label} action threw unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
					)
				}
			},
		}
	}

	return actions
}

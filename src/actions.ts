import type { CompanionActionDefinitions, DropdownChoice } from '@companion-module/base'
import { Cause, Exit } from 'effect'
import type { ModuleInstance } from './main.js'
import { BuildRouteTypes } from './routeTypes.js'
import type { ConflictStrategy, RouterSnapshot } from './videoipath/types.js'

const parseConflictStrategy = (value: unknown): ConflictStrategy => {
	switch (value) {
		case '0':
		case 0:
			return 0
		case '2':
		case 2:
			return 2
		case '1':
		case 1:
		default:
			return 1
	}
}

export function BuildActionDefinitions(self: ModuleInstance, snapshot: RouterSnapshot): CompanionActionDefinitions {
	const actions: CompanionActionDefinitions = {}

	for (const { type, label, description, sourceChoices, sourceLookup, destChoices, destLookup } of BuildRouteTypes(
		snapshot,
	)) {
		const sourceChoicesWithDisconnect: DropdownChoice[] = [
			{ id: 'disconnect', label: '(Disconnect)' },
			...sourceChoices,
		]

		actions[`route_${type}`] = {
			name: `Route ${label}`,
			description,
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
					const conflictStrategy = parseConflictStrategy(event.options.conflictStrategy)

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

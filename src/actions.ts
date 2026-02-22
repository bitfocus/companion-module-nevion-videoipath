import type { CompanionActionDefinitions, DropdownChoice } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import type { Endpoint, RouterSnapshot } from './videoipath/types.js'

function buildChoices(endpoints: ReadonlyArray<Endpoint>): DropdownChoice[] {
	return endpoints
		.slice()
		.sort((a, b) => a.label.localeCompare(b.label))
		.map((ep) => ({ id: ep.id, label: ep.label }))
}

export function BuildActionDefinitions(self: ModuleInstance, snapshot: RouterSnapshot): CompanionActionDefinitions {
	const sources = Array.from(snapshot.endpoints.values()).filter(
		(ep) => ep.endpointType === 'src' || ep.endpointType === 'both',
	)
	const destinations = Array.from(snapshot.endpoints.values()).filter(
		(ep) => ep.endpointType === 'dst' || ep.endpointType === 'both',
	)

	const sourceChoices = buildChoices(sources)
	const destChoices = buildChoices(destinations)

	return {
		route: {
			name: 'Route Source to Destination',
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					choices: sourceChoices,
					default: sourceChoices[0]?.id ?? '',
				},
				{
					id: 'destination',
					type: 'dropdown',
					label: 'Destination',
					choices: destChoices,
					default: destChoices[0]?.id ?? '',
				},
			],
			callback: async (event) => {
				const source = event.options.source as string
				const destination = event.options.destination as string

				if (!source || !destination) {
					self.log('warn', 'Route action missing source or destination')
					return
				}

				self.log('info', `Routing ${source} -> ${destination}`)

				try {
					await self.executeRoute(source, destination)
					self.log('info', `Route ${source} -> ${destination} successful`)
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err)
					self.log('error', `Route failed: ${message}`)
				}
			},
		},
	}
}

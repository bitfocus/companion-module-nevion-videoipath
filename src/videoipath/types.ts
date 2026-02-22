export interface Endpoint {
	readonly id: string
	readonly label: string
	readonly endpointType: 'src' | 'dst' | 'both'
}

export interface Connection {
	readonly id: string
	readonly rev: string
	readonly from: string
	readonly to: string
	readonly state: string
	readonly label: string
}

export interface RouterSnapshot {
	readonly endpoints: ReadonlyMap<string, Endpoint>
	readonly connections: ReadonlyMap<string, Connection>
}

export interface ConnectResponse {
	readonly header: {
		readonly ok: boolean
		readonly msg: string[]
		readonly status: string
	}
	readonly data: {
		readonly entries: ReadonlyArray<{
			readonly result: {
				readonly ok: boolean
				readonly code: number
				readonly msg: string[]
			}
		}>
	}
}

export interface SessionInfo {
	readonly sessionCookie: string
	readonly xsrfToken: string
}

export interface SubscriptionResult {
	readonly id: string
	readonly data: unknown
}

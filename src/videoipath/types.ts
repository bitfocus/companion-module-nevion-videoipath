/** Sanitize an API ID segment for internal use */
export const sanitizeId = (id: string): string => id.replace(/[^a-zA-Z0-9_-]/g, '_')

/** Build prefixed ID: (src|dst)_(sanitized api id) */
export const makeCompanionId = (direction: 'src' | 'dst', apiId: string): string => `${direction}_${sanitizeId(apiId)}`

export interface Endpoint {
	readonly id: string
	readonly label: string
	readonly endpointType: 'src' | 'dst' | 'both'
	readonly specificType: string
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

export type BookingStrategy = 0 | 1 | 2 | 3 | 4 | 5

export type ConflictStrategy = 0 | 1 | 2

export type ConnectionType = 'p2p' | 'p2mp' | 'bidir'

export interface OnceScheduleInfo {
	readonly type: 'once'
	readonly startTimestamp: number | null
	readonly endTimestamp: number | null
}

export interface RecurringScheduleInfo {
	readonly type: 'recurring'
	readonly pattern: 0 | 1 | 2
	readonly startTime: number
	readonly endTime: number
	readonly timeZoneId: string
	readonly iterationFilter: readonly number[]
	readonly weekDays: readonly number[]
	readonly localStartTime: number
	readonly localEndTime: number
}

export type ScheduleInfo = OnceScheduleInfo | RecurringScheduleInfo

export interface ConnectRequestEntry {
	readonly from: string
	readonly to: string
	readonly profiles: readonly string[]
	readonly tags: readonly string[]
	readonly scheduleInfo: ScheduleInfo
	readonly ctype: ConnectionType
}

export interface ConnectRequest {
	readonly header: {
		readonly id: number
	}
	readonly data: {
		readonly entries: readonly ConnectRequestEntry[]
		readonly bookingStrategy: BookingStrategy
		readonly conflictStrategy: ConflictStrategy
	}
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

export type DisconnectResponse = ConnectResponse

export interface SessionInfo {
	readonly sessionCookie: string
	readonly xsrfToken: string
}

export interface SubscriptionResult {
	readonly id: string
	readonly data: unknown
}

import { Data } from 'effect'

export class AuthenticationError extends Data.TaggedError('AuthenticationError')<{
	readonly message: string
	readonly statusCode?: number
}> {}

export class ApiRequestError extends Data.TaggedError('ApiRequestError')<{
	readonly message: string
	readonly endpoint: string
	readonly statusCode?: number
	readonly cause?: unknown
}> {}

export class SubscriptionError extends Data.TaggedError('SubscriptionError')<{
	readonly message: string
	readonly subscriptionId?: string
	readonly cause?: unknown
}> {}

export class ConnectionError extends Data.TaggedError('ConnectionError')<{
	readonly message: string
	readonly from: string
	readonly to: string
	readonly code?: number
}> {}

export class SessionExpiredError extends Data.TaggedError('SessionExpiredError')<{
	readonly message: string
}> {}

import { Context, Effect, Ref } from 'effect'
import type { SessionInfo, ConnectResponse } from './types.js'
import { AuthenticationError, ApiRequestError, SessionExpiredError, ConnectionError } from './errors.js'

export interface VideoIPathConfig {
	readonly host: string
	readonly port: number
	readonly username: string
	readonly password: string
	readonly rejectUnauthorized: boolean
}

export class VideoIPathConfigTag extends Context.Tag('VideoIPathConfig')<VideoIPathConfigTag, VideoIPathConfig>() {}

export interface VideoIPathClient {
	readonly login: () => Effect.Effect<void, AuthenticationError>
	readonly logout: () => Effect.Effect<void>
	readonly get: (path: string) => Effect.Effect<unknown, ApiRequestError | SessionExpiredError>
	readonly post: (path: string, body: unknown) => Effect.Effect<unknown, ApiRequestError | SessionExpiredError>
	readonly connect: (from: string, to: string) => Effect.Effect<ConnectResponse, ConnectionError | SessionExpiredError>
	readonly createSubscription: (
		path: string,
	) => Effect.Effect<{ id: string; data: unknown }, ApiRequestError | SessionExpiredError>
	readonly pollSubscription: (id: string) => Effect.Effect<unknown | null, ApiRequestError | SessionExpiredError>
	readonly deleteSubscription: (id: string) => Effect.Effect<void, ApiRequestError | SessionExpiredError>
}

export class VideoIPathClientTag extends Context.Tag('VideoIPathClient')<VideoIPathClientTag, VideoIPathClient>() {}

const buildBaseUrl = (config: VideoIPathConfig): string =>
	`https://${config.host}${config.port !== 443 ? `:${config.port}` : ''}`

const makeFetchOptions = (
	session: SessionInfo | null,
	method: string,
	body?: unknown,
	contentType?: string,
): RequestInit => {
	const headers: Record<string, string> = {
		Accept: 'application/json',
		'Accept-Encoding': 'gzip, deflate',
	}

	if (session) {
		headers['Cookie'] = `VipathSession=${session.sessionCookie}`
		headers['X-XSRF-TOKEN'] = session.xsrfToken
	}

	if (contentType) {
		headers['Content-Type'] = contentType
	} else if (body !== undefined) {
		headers['Content-Type'] = 'application/json'
	}

	return {
		method,
		headers,
		body:
			contentType === 'application/x-www-form-urlencoded'
				? (body as string)
				: body !== undefined
					? JSON.stringify(body)
					: undefined,
	}
}

export const makeVideoIPathClient = Effect.gen(function* () {
	const config = yield* VideoIPathConfigTag
	const sessionRef = yield* Ref.make<SessionInfo | null>(null)
	const baseUrl = buildBaseUrl(config)

	if (!config.rejectUnauthorized) {
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
	}

	const getSession = Ref.get(sessionRef).pipe(
		Effect.flatMap((session) =>
			session
				? Effect.succeed(session)
				: Effect.fail(new SessionExpiredError({ message: 'Not authenticated. Call login() first.' })),
		),
	)

	const extractSessionFromResponse = (response: Response): Effect.Effect<SessionInfo, AuthenticationError> =>
		Effect.gen(function* () {
			const setCookieHeaders = response.headers.getSetCookie()
			let sessionCookie: string | null = null
			let xsrfToken: string | null = null

			for (const header of setCookieHeaders) {
				const vipathMatch = header.match(/VipathSession=([^;]+)/)
				if (vipathMatch) sessionCookie = vipathMatch[1]

				const xsrfMatch = header.match(/XSRF-TOKEN=([^;]+)/)
				if (xsrfMatch) xsrfToken = xsrfMatch[1]
			}

			if (!sessionCookie || !xsrfToken) {
				return yield* new AuthenticationError({
					message: `Login response missing session cookies. Got headers: ${setCookieHeaders.join(', ')}`,
				})
			}

			return { sessionCookie, xsrfToken } as SessionInfo
		})

	const login = (): Effect.Effect<void, AuthenticationError> =>
		Effect.gen(function* () {
			const url = `${baseUrl}/api/_session`
			const body = `name=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`

			const response = yield* Effect.tryPromise({
				try: async () => fetch(url, makeFetchOptions(null, 'POST', body, 'application/x-www-form-urlencoded')),
				catch: (cause) =>
					new AuthenticationError({
						message: `Failed to connect to VideoIPath at ${config.host}: ${cause instanceof Error ? cause.message : String(cause)}`,
					}),
			})

			if (!response.ok) {
				return yield* new AuthenticationError({
					message: `Authentication failed: ${response.status} ${response.statusText}`,
					statusCode: response.status,
				})
			}

			const session = yield* extractSessionFromResponse(response)
			yield* Ref.set(sessionRef, session)
		})

	const logout = (): Effect.Effect<void> =>
		Effect.gen(function* () {
			const session = yield* Ref.get(sessionRef)
			if (!session) return

			yield* Effect.tryPromise({
				try: async () => fetch(`${baseUrl}/api/_session`, makeFetchOptions(session, 'DELETE')),
				catch: () => void 0 as never,
			}).pipe(Effect.ignore)

			yield* Ref.set(sessionRef, null)
		})

	const get = (path: string): Effect.Effect<unknown, ApiRequestError | SessionExpiredError> =>
		Effect.gen(function* () {
			const session = yield* getSession
			const url = `${baseUrl}${path}`

			const response = yield* Effect.tryPromise({
				try: async () => fetch(url, makeFetchOptions(session, 'GET')),
				catch: (cause) =>
					new ApiRequestError({
						message: `GET request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
						endpoint: path,
						cause,
					}),
			})

			if (response.status === 401) {
				return yield* new SessionExpiredError({ message: 'Session expired during GET request' })
			}

			if (!response.ok) {
				return yield* new ApiRequestError({
					message: `GET ${path} returned ${response.status} ${response.statusText}`,
					endpoint: path,
					statusCode: response.status,
				})
			}

			return yield* Effect.tryPromise({
				try: async () => response.json(),
				catch: (cause) =>
					new ApiRequestError({
						message: `Failed to parse JSON response from ${path}`,
						endpoint: path,
						cause,
					}),
			})
		})

	const post = (path: string, body: unknown): Effect.Effect<unknown, ApiRequestError | SessionExpiredError> =>
		Effect.gen(function* () {
			const session = yield* getSession
			const url = `${baseUrl}${path}`

			const response = yield* Effect.tryPromise({
				try: async () => fetch(url, makeFetchOptions(session, 'POST', body)),
				catch: (cause) =>
					new ApiRequestError({
						message: `POST request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
						endpoint: path,
						cause,
					}),
			})

			if (response.status === 401) {
				return yield* new SessionExpiredError({ message: 'Session expired during POST request' })
			}

			if (!response.ok) {
				return yield* new ApiRequestError({
					message: `POST ${path} returned ${response.status} ${response.statusText}`,
					endpoint: path,
					statusCode: response.status,
				})
			}

			return yield* Effect.tryPromise({
				try: async () => response.json(),
				catch: (cause) =>
					new ApiRequestError({
						message: `Failed to parse JSON response from ${path}`,
						endpoint: path,
						cause,
					}),
			})
		})

	const connect = (from: string, to: string): Effect.Effect<ConnectResponse, ConnectionError | SessionExpiredError> =>
		Effect.gen(function* () {
			const session = yield* getSession
			const url = `${baseUrl}/api/connect`

			const requestBody = {
				header: { id: 0 },
				data: {
					entries: [
						{
							from,
							to,
							profiles: [],
							tags: [],
							scheduleInfo: {
								type: 'once',
								startTimestamp: null,
								endTimestamp: null,
							},
							ctype: 'p2p',
						},
					],
					bookingStrategy: 2,
					conflictStrategy: 0,
				},
			}

			const response = yield* Effect.tryPromise({
				try: async () => fetch(url, makeFetchOptions(session, 'POST', requestBody)),
				catch: (cause) =>
					new ConnectionError({
						message: `Connect request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
						from,
						to,
					}),
			})

			if (response.status === 401) {
				return yield* new SessionExpiredError({ message: 'Session expired during connect request' })
			}

			const json = yield* Effect.tryPromise({
				try: async () => response.json() as Promise<ConnectResponse>,
				catch: (cause) =>
					new ConnectionError({
						message: `Failed to parse connect response: ${cause instanceof Error ? cause.message : String(cause)}`,
						from,
						to,
					}),
			})

			if (!json.header.ok) {
				return yield* new ConnectionError({
					message: `Route failed: ${json.header.msg.join(', ') || json.header.status}`,
					from,
					to,
				})
			}

			const entry = json.data.entries[0]
			if (entry && !entry.result.ok) {
				return yield* new ConnectionError({
					message: `Route failed: ${entry.result.msg.join(', ')}`,
					from,
					to,
					code: entry.result.code,
				})
			}

			return json
		})

	const createSubscription = (
		subscriptionPath: string,
	): Effect.Effect<{ id: string; data: unknown }, ApiRequestError | SessionExpiredError> =>
		post('/rest/v1/sessions/me/subsc', { path: subscriptionPath }).pipe(
			Effect.flatMap((result) => {
				const obj = result as Record<string, unknown>
				const id = obj._id as string

				if (!id) {
					return Effect.fail(
						new ApiRequestError({
							message: 'Subscription response missing _id field',
							endpoint: '/rest/v1/sessions/me/subsc',
						}),
					)
				}

				return Effect.succeed({ id, data: obj })
			}),
		)

	const pollSubscription = (id: string): Effect.Effect<unknown | null, ApiRequestError | SessionExpiredError> =>
		Effect.gen(function* () {
			const result = yield* post(`/rest/v1/sessions/me/subsc/${id}/ack`, {})
			return result
		})

	const deleteSubscription = (id: string): Effect.Effect<void, ApiRequestError | SessionExpiredError> =>
		Effect.gen(function* () {
			const session = yield* getSession
			const url = `${baseUrl}/rest/v1/sessions/me/subsc/${id}`

			yield* Effect.tryPromise({
				try: async () => fetch(url, makeFetchOptions(session, 'DELETE')),
				catch: () => void 0 as never,
			}).pipe(Effect.ignore)
		})

	return {
		login,
		logout,
		get,
		post,
		connect,
		createSubscription,
		pollSubscription,
		deleteSubscription,
	} satisfies VideoIPathClient
})

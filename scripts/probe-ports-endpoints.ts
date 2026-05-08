import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

type SessionInfo = {
	sessionCookie: string
	xsrfToken: string
}

const DEFAULT_USERNAME = 'bitfocus_ui'
const DEFAULT_PASSWORD = 'July2025'
const DEFAULT_PORT = 443
const DEFAULT_OUT_FILE = 'videoipath-endpoints.json'
const ENDPOINTS_SUBSCRIPTION_PATH = '/status/conman/endpoints/**'

type Args = {
	host: string
	port: number
	useHttps: boolean
	insecure: boolean
	username: string
	password: string
	outFile: string
}

function parseArgs(argv: string[]): Args {
	const options = new Map<string, string>()

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (!arg.startsWith('--')) continue

		const [key, inlineValue] = arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, undefined]
		if (inlineValue !== undefined) {
			options.set(key, inlineValue)
			continue
		}

		const next = argv[i + 1]
		if (next && !next.startsWith('--')) {
			options.set(key, next)
			i++
		} else {
			options.set(key, 'true')
		}
	}

	const host = options.get('--host') ?? process.env.VIPATH_HOST ?? ''
	if (!host) {
		throw new Error(
			'Missing required --host value. Example: bun run scripts/export-ports.ts --host videoipath.example.com',
		)
	}

	const useHttps = (options.get('--https') ?? process.env.VIPATH_HTTPS ?? 'true') !== 'false'
	const insecure = (options.get('--insecure') ?? process.env.VIPATH_INSECURE ?? 'false') === 'true'
	const port = Number(options.get('--port') ?? process.env.VIPATH_PORT ?? DEFAULT_PORT)
	if (!Number.isFinite(port) || port <= 0) {
		throw new Error(`Invalid port: ${String(options.get('--port') ?? process.env.VIPATH_PORT ?? DEFAULT_PORT)}`)
	}

	return {
		host,
		port,
		useHttps,
		insecure,
		username: options.get('--username') ?? process.env.VIPATH_USERNAME ?? DEFAULT_USERNAME,
		password: options.get('--password') ?? process.env.VIPATH_PASSWORD ?? DEFAULT_PASSWORD,
		outFile: options.get('--out') ?? process.env.VIPATH_OUT ?? DEFAULT_OUT_FILE,
	}
}

function buildBaseUrl(args: Args): string {
	const protocol = args.useHttps ? 'https' : 'http'
	const defaultPort = args.useHttps ? 443 : 80
	const portSuffix = args.port === defaultPort ? '' : `:${args.port}`
	return `${protocol}://${args.host}${portSuffix}`
}

function getSetCookieHeaders(headers: Headers): string[] {
	const maybeGetSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
	if (typeof maybeGetSetCookie === 'function') {
		return maybeGetSetCookie.call(headers)
	}

	const single = headers.get('set-cookie')
	return single ? [single] : []
}

function extractSession(headers: Headers): SessionInfo {
	const setCookieHeaders = getSetCookieHeaders(headers)
	let sessionCookie: string | null = null
	let xsrfToken: string | null = null

	for (const header of setCookieHeaders) {
		const vipathMatch = header.match(/VipathSession=([^;]+)/)
		if (vipathMatch) sessionCookie = vipathMatch[1]

		const xsrfMatch = header.match(/XSRF-TOKEN=([^;]+)/)
		if (xsrfMatch) xsrfToken = xsrfMatch[1]
	}

	if (!sessionCookie || !xsrfToken) {
		throw new Error(`Login response missing session cookies. Received: ${setCookieHeaders.join(' | ')}`)
	}

	return { sessionCookie, xsrfToken }
}

type HeadersInit = Record<string, string>

function makeAuthHeaders(session: SessionInfo): HeadersInit {
	return {
		Accept: 'application/json',
		'Content-Type': 'application/json',
		Cookie: `VipathSession=${session.sessionCookie}`,
		'X-XSRF-TOKEN': session.xsrfToken,
	}
}

function countEndpoints(data: unknown): number {
	try {
		const root = data as Record<string, unknown>
		const dataNode = (root.data ?? root) as Record<string, unknown>
		const statusNode = (dataNode.status ?? dataNode) as Record<string, unknown>
		const conmanNode = (statusNode.conman ?? statusNode) as Record<string, unknown>
		const endpointsNode = conmanNode.endpoints as Record<string, unknown>
		return endpointsNode && typeof endpointsNode === 'object' ? Object.keys(endpointsNode).length : 0
	} catch {
		return 0
	}
}

async function login(baseUrl: string, username: string, password: string): Promise<SessionInfo> {
	const response = await fetch(`${baseUrl}/api/_session`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: `name=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
	})

	if (!response.ok) {
		throw new Error(`Authentication failed: ${response.status} ${response.statusText}`)
	}

	return extractSession(response.headers)
}

async function createEndpointSubscription(
	baseUrl: string,
	session: SessionInfo,
): Promise<{ id: string; body: unknown }> {
	const response = await fetch(`${baseUrl}/rest/v1/sessions/me/subsc`, {
		method: 'POST',
		headers: makeAuthHeaders(session),
		body: JSON.stringify({ path: ENDPOINTS_SUBSCRIPTION_PATH }),
	})

	if (!response.ok) {
		throw new Error(`Subscription creation failed: ${response.status} ${response.statusText}`)
	}

	const body = (await response.json()) as Record<string, unknown>
	const id = typeof body._id === 'string' ? body._id : ''
	if (!id) {
		throw new Error('Subscription response missing _id')
	}

	return { id, body }
}

async function deleteSubscription(baseUrl: string, session: SessionInfo, id: string): Promise<void> {
	await fetch(`${baseUrl}/rest/v1/sessions/me/subsc/${id}`, {
		method: 'DELETE',
		headers: {
			Accept: 'application/json',
			Cookie: `VipathSession=${session.sessionCookie}`,
			'X-XSRF-TOKEN': session.xsrfToken,
		},
	})
}

async function logout(baseUrl: string, session: SessionInfo): Promise<void> {
	await fetch(`${baseUrl}/api/_session`, {
		method: 'DELETE',
		headers: {
			Accept: 'application/json',
			Cookie: `VipathSession=${session.sessionCookie}`,
			'X-XSRF-TOKEN': session.xsrfToken,
		},
	})
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2))
	if (args.useHttps && args.insecure) {
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
	}
	const baseUrl = buildBaseUrl(args)

	let session: SessionInfo | null = null
	let subscriptionId: string | null = null

	try {
		session = await login(baseUrl, args.username, args.password)
		const subscription = await createEndpointSubscription(baseUrl, session)
		subscriptionId = subscription.id

		await mkdir(dirname(args.outFile), { recursive: true })
		await writeFile(args.outFile, `${JSON.stringify(subscription.body, null, 2)}\n`, 'utf8')

		const endpointCount = countEndpoints(subscription.body)
		console.log(`Wrote ${endpointCount} endpoints to ${args.outFile}`)
	} finally {
		if (session && subscriptionId) {
			await deleteSubscription(baseUrl, session, subscriptionId).catch(() => undefined)
		}
		if (session) {
			await logout(baseUrl, session).catch(() => undefined)
		}
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error))
	// eslint-disable-next-line -- intentional
	process.exit(1)
})

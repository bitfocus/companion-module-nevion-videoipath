import type { Endpoint, VertexFormat } from './types.js'

// Codec vertices in the topology config, projected to the fields that decide the essence
export const VERTEX_FORMATS_PATH =
	"/rest/v2/data/config/network/nGraphElements/* where type='codecVertex' /id,codecFormat,extraFormats"

const CODEC_FORMATS: Record<string, VertexFormat> = {
	Video: 'video',
	Audio: 'audio',
	Ancillary: 'ancillary',
	ASI: 'asi',
}

const isEmptyFormatList = (value: unknown): boolean => {
	if (value === undefined || value === null) return true
	if (Array.isArray(value)) return value.length === 0
	if (typeof value === 'object') return Object.keys(value).length === 0
	return false
}

/**
 * Parse codec vertex formats from an nGraphElements response.
 * A vertex with extra formats carries more than one essence, so it gets no single format.
 */
export const parseVertexFormats = (data: unknown): Map<string, VertexFormat | null> => {
	const formats = new Map<string, VertexFormat | null>()

	const root = data as Record<string, unknown> | null
	const dataNode = (root?.data ?? root) as Record<string, unknown> | undefined
	const configNode = (dataNode?.config ?? dataNode) as Record<string, unknown> | undefined
	const networkNode = (configNode?.network ?? configNode) as Record<string, unknown> | undefined
	const elementsNode = (networkNode?.nGraphElements ?? networkNode) as Record<string, unknown> | undefined
	if (!elementsNode || typeof elementsNode !== 'object') return formats

	// Queries return an `_items` list; a plain read returns elements keyed by id
	const items = Array.isArray(elementsNode._items)
		? (elementsNode._items as unknown[]).map((item) => [undefined, item] as const)
		: Object.entries(elementsNode)

	for (const [key, item] of items) {
		if (!item || typeof item !== 'object') continue
		const element = item as Record<string, unknown>
		const id = element._id ?? element.id ?? key
		if (typeof id !== 'string') continue

		const codecFormat = typeof element.codecFormat === 'string' ? CODEC_FORMATS[element.codecFormat] : undefined
		formats.set(id, codecFormat && isEmptyFormatList(element.extraFormats) ? codecFormat : null)
	}

	return formats
}

/** Attach known formats to vertex endpoints. Returns the same map when nothing changes. */
export const applyVertexFormats = (
	endpoints: ReadonlyMap<string, Endpoint>,
	formats: ReadonlyMap<string, VertexFormat | null>,
): ReadonlyMap<string, Endpoint> => {
	let updated: Map<string, Endpoint> | null = null

	for (const [id, ep] of endpoints) {
		if (!ep.vertexId) continue
		const format = formats.get(ep.vertexId) ?? null
		if (format === ep.format) continue
		updated ??= new Map(endpoints)
		updated.set(id, { ...ep, format })
	}

	return updated ?? endpoints
}

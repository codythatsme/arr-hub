import { Effect } from "effect"
import { XMLParser } from "fast-xml-parser"

import type {
  IndexerCapabilities,
  IndexerConfig,
  ReleaseCandidate,
  SearchQuery,
} from "../domain/indexer"
import { IndexerError, type IndexerErrorReason } from "../errors"

// ── Types ──

export interface IndexerAdapter {
  readonly testConnection: () => Effect.Effect<IndexerCapabilities, IndexerError>
  readonly search: (
    query: SearchQuery,
  ) => Effect.Effect<ReadonlyArray<ReleaseCandidate>, IndexerError>
}

// ── Torznab error code → reason mapping ──

const ERROR_CODE_MAP: Record<number, { reason: IndexerErrorReason; retryable: boolean }> = {
  100: { reason: "auth_failed", retryable: false },
  101: { reason: "auth_failed", retryable: false },
  102: { reason: "auth_failed", retryable: false },
  500: { reason: "invalid_response", retryable: true },
  501: { reason: "invalid_response", retryable: false },
  910: { reason: "rate_limited", retryable: true },
}

// ── XML parser ──

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "item" || name === "category" || name === "attr",
})

// ── Helpers ──

function buildUrl(
  baseUrl: string,
  apiKey: string,
  params: Record<string, string | number | undefined>,
): URL {
  const url = new URL(baseUrl.endsWith("/api") ? baseUrl : `${baseUrl.replace(/\/+$/, "")}/api`)
  url.searchParams.set("apikey", apiKey)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v))
  }
  return url
}

function fetchXml(url: URL, config: IndexerConfig): Effect.Effect<unknown, IndexerError> {
  return Effect.tryPromise({
    try: async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)
      try {
        const res = await fetch(url.toString(), { signal: controller.signal })
        if (!res.ok) {
          throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
        }
        const text = await res.text()
        return xmlParser.parse(text)
      } finally {
        clearTimeout(timeout)
      }
    },
    catch: (e) => {
      if (e instanceof Error && e.name === "AbortError") {
        return new IndexerError({
          indexerId: config.id,
          indexerName: config.name,
          reason: "search_timeout",
          message: "request timed out after 15s",
          retryable: true,
        })
      }
      const status = (e as Record<string, unknown>).status
      if (status === 401 || status === 403) {
        return new IndexerError({
          indexerId: config.id,
          indexerName: config.name,
          reason: "auth_failed",
          message: `HTTP ${status}`,
          retryable: false,
        })
      }
      return new IndexerError({
        indexerId: config.id,
        indexerName: config.name,
        reason: "connection_failed",
        message: e instanceof Error ? e.message : "fetch failed",
        retryable: true,
      })
    },
  })
}

function checkTorznabError(
  parsed: unknown,
  config: IndexerConfig,
): Effect.Effect<void, IndexerError> {
  const error = (parsed as Record<string, unknown>)?.error as Record<string, unknown> | undefined
  const attrError = error?.["@_code"] ?? error?.["@_description"]
  if (!attrError && !error) return Effect.void
  const code = Number(error?.["@_code"] ?? 0)
  const desc = String(error?.["@_description"] ?? "unknown indexer error")
  const mapped = ERROR_CODE_MAP[code] ?? { reason: "invalid_response" as const, retryable: false }
  return new IndexerError({
    indexerId: config.id,
    indexerName: config.name,
    reason: mapped.reason,
    message: desc,
    retryable: mapped.retryable,
  })
}

function parseCaps(parsed: unknown): IndexerCapabilities {
  const caps = (parsed as Record<string, unknown>)?.caps as Record<string, unknown> | undefined
  const searching = caps?.searching as Record<string, unknown> | undefined
  const categories = caps?.categories as Record<string, unknown> | undefined

  const searchTypes: Array<string> = []
  if (searching) {
    for (const [key, val] of Object.entries(searching)) {
      const available = (val as Record<string, unknown>)?.["@_available"]
      if (available === "yes") searchTypes.push(key)
    }
  }

  const cats: Array<{ id: number; name: string }> = []
  const catList = categories?.category
  if (Array.isArray(catList)) {
    for (const cat of catList) {
      const id = Number(cat?.["@_id"])
      const name = String(cat?.["@_name"] ?? "")
      if (!Number.isNaN(id)) cats.push({ id, name })
    }
  }

  return { searchTypes, categories: cats }
}

function getAttr(item: Record<string, unknown>, name: string): string | undefined {
  const attrs = item["torznab:attr"] ?? item["newznab:attr"] ?? item.attr
  if (!Array.isArray(attrs)) return undefined
  const found = attrs.find((a: Record<string, unknown>) => a["@_name"] === name)
  return found ? String(found["@_value"]) : undefined
}

function parseReleases(parsed: unknown, config: IndexerConfig): ReadonlyArray<ReleaseCandidate> {
  const channel = (parsed as Record<string, unknown>)?.rss as Record<string, unknown> | undefined
  const items = (channel?.channel as Record<string, unknown> | undefined)?.item
  if (!Array.isArray(items)) return []

  const protocol = config.type === "torznab" ? ("torrent" as const) : ("usenet" as const)
  const now = Date.now()

  return items.map((item: Record<string, unknown>): ReleaseCandidate => {
    const pubDate = item.pubDate ? new Date(String(item.pubDate)) : new Date()
    const ageMs = now - pubDate.getTime()
    const ageDays = Math.max(0, Math.floor(ageMs / 86_400_000))

    return {
      title: String(item.title ?? ""),
      indexerId: config.id,
      indexerName: config.name,
      indexerPriority: config.priority,
      size: Number(getAttr(item as Record<string, unknown>, "size") ?? item.size ?? 0),
      seeders:
        protocol === "torrent"
          ? Number(getAttr(item as Record<string, unknown>, "seeders") ?? 0)
          : null,
      leechers:
        protocol === "torrent"
          ? Number(getAttr(item as Record<string, unknown>, "peers") ?? 0)
          : null,
      age: ageDays,
      downloadUrl: String(item.link ?? ""),
      infoUrl: item.comments
        ? String(item.comments)
        : item.guid
          ? String((item.guid as Record<string, unknown>)?.["#text"] ?? item.guid)
          : null,
      category: getAttr(item as Record<string, unknown>, "category") ?? String(item.category ?? ""),
      protocol,
      publishedAt: pubDate,
      infohash: getAttr(item as Record<string, unknown>, "infohash") ?? null,
      downloadFactor: Number(getAttr(item as Record<string, unknown>, "downloadvolumefactor") ?? 1),
      uploadFactor: Number(getAttr(item as Record<string, unknown>, "uploadvolumefactor") ?? 1),
    }
  })
}

// ── Search type mapping ──

const SEARCH_TYPE_MAP: Record<string, string> = {
  movie: "movie",
  tv: "tvsearch",
  general: "search",
}

// ── Factory ──

export function createAdapter(config: IndexerConfig): IndexerAdapter {
  return {
    testConnection: () =>
      Effect.gen(function* () {
        const url = buildUrl(config.baseUrl, config.apiKey, { t: "caps" })
        const parsed = yield* fetchXml(url, config)
        yield* checkTorznabError(parsed, config)
        return parseCaps(parsed)
      }),

    search: (query) =>
      Effect.gen(function* () {
        const params: Record<string, string | number | undefined> = {
          t: SEARCH_TYPE_MAP[query.type] ?? "search",
          q: query.term || undefined,
          limit: query.limit,
          cat: query.categories?.join(","),
          imdbid: query.imdbId,
          tmdbid: query.tmdbId,
          tvdbid: query.tvdbId,
          season: query.season,
          ep: query.episode,
        }
        const url = buildUrl(config.baseUrl, config.apiKey, params)
        const parsed = yield* fetchXml(url, config)
        yield* checkTorznabError(parsed, config)
        return parseReleases(parsed, config)
      }),
  }
}

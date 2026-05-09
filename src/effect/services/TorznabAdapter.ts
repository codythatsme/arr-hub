import http from "node:http"
import https from "node:https"

import { Effect } from "effect"
import { XMLParser } from "fast-xml-parser"
import { SocksProxyAgent } from "socks-proxy-agent"
import { ProxyAgent, type Dispatcher } from "undici"

import type {
  IndexerAdapterMetadata,
  IndexerCapabilities,
  IndexerConfig,
  IndexerOutboundProxy,
  ReleaseCandidate,
} from "../domain/indexer"
import { IndexerError, type IndexerErrorReason } from "../errors"
import type { IndexerAdapter } from "./IndexerAdapter"

// ── Metadata ──

export const torznabMetadata: IndexerAdapterMetadata = {
  displayName: "Torznab",
  protocolAffinity: "torrent",
  authModel: "API key",
}

export const newznabMetadata: IndexerAdapterMetadata = {
  displayName: "Newznab",
  protocolAffinity: "usenet",
  authModel: "API key",
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

type IndexerFetchInit = RequestInit & {
  readonly dispatcher?: Dispatcher
  readonly proxy?: string
}

export interface IndexerTextResponse {
  readonly status: number
  readonly text: string
  readonly headers: Headers
}

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

function buildProxyUrl(proxy: IndexerOutboundProxy): string {
  const scheme = proxy.type === "socks4" ? "socks4" : proxy.type === "socks5" ? "socks5" : "http"
  const url = new URL(proxy.host.includes("://") ? proxy.host : `${scheme}://${proxy.host}`)
  if (proxy.port !== null) url.port = String(proxy.port)
  if (proxy.username !== null && proxy.username.length > 0) url.username = proxy.username
  if (proxy.password !== null && proxy.password.length > 0) url.password = proxy.password
  return url.toString()
}

function buildFetchInit(
  signal: AbortSignal,
  proxy: IndexerOutboundProxy | null | undefined,
): { readonly init: IndexerFetchInit; readonly dispatcher: Dispatcher | null } {
  if (!proxy || proxy.type === "flaresolverr") return { init: { signal }, dispatcher: null }

  const proxyUrl = buildProxyUrl(proxy)
  const dispatcher = proxy.type === "http" ? new ProxyAgent(proxyUrl) : null
  return {
    init: {
      signal,
      proxy: proxyUrl,
      ...(dispatcher ? { dispatcher } : {}),
    },
    dispatcher,
  }
}

function flaresolverrEndpoint(proxy: IndexerOutboundProxy): string {
  const base = proxy.host.replace(/\/+$/, "")
  return base.endsWith("/v1") ? base : `${base}/v1`
}

function headersFromUnknown(value: unknown): Headers {
  const headers = new Headers()
  if (value === null || typeof value !== "object" || Array.isArray(value)) return headers

  for (const [key, headerValue] of Object.entries(value)) {
    if (headerValue === undefined) continue
    if (Array.isArray(headerValue)) {
      for (const item of headerValue) headers.append(key, String(item))
    } else {
      headers.set(key, String(headerValue))
    }
  }
  return headers
}

function parseFlaresolverrResponse(payload: unknown): IndexerTextResponse {
  const root = payload as Record<string, unknown>
  if (root.status !== "ok") {
    throw new Error(String(root.message ?? "FlareSolverr request failed"))
  }

  const solution = root.solution as Record<string, unknown> | undefined
  const status = Number(solution?.status ?? 200)
  if (status >= 400) {
    throw Object.assign(new Error(`HTTP ${status}`), { status })
  }

  const response = solution?.response
  if (typeof response !== "string") throw new Error("FlareSolverr response did not include text")
  return {
    status,
    text: response,
    headers: headersFromUnknown(solution?.headers),
  }
}

async function fetchTextViaSocksProxy(
  url: URL,
  proxy: IndexerOutboundProxy,
  signal: AbortSignal,
  init: RequestInit = {},
): Promise<IndexerTextResponse> {
  const agent = new SocksProxyAgent(buildProxyUrl(proxy))
  const client = url.protocol === "https:" ? https : http
  const method = init.method ?? "GET"
  const body = bodyText(init.body)
  const headers = new Headers(init.headers)
  if (!headers.has("accept")) headers.set("accept", "application/xml,text/xml,*/*")
  if (body !== null && !headers.has("content-length")) {
    headers.set("content-length", String(Buffer.byteLength(body)))
  }

  try {
    return await new Promise((resolve, reject) => {
      const req = client.request(
        url,
        {
          method,
          agent,
          headers: Object.fromEntries(headers.entries()),
        },
        (res) => {
          const chunks: Array<Buffer> = []
          res.on("data", (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          })
          res.on("end", () => {
            resolve({
              status: res.statusCode ?? 0,
              text: Buffer.concat(chunks).toString("utf8"),
              headers: headersFromUnknown(res.headers),
            })
          })
        },
      )

      const abort = () => {
        const error = new Error("The operation was aborted")
        error.name = "AbortError"
        req.destroy(error)
      }
      signal.addEventListener("abort", abort, { once: true })
      req.on("error", reject)
      req.on("close", () => signal.removeEventListener("abort", abort))
      if (body !== null) req.write(body)
      req.end()
    })
  } finally {
    agent.destroy()
  }
}

function bodyText(body: BodyInit | null | undefined): string | null {
  if (body === undefined || body === null) return null
  if (typeof body === "string") return body
  if (body instanceof URLSearchParams) return body.toString()
  return null
}

function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries())
}

export function fetchIndexerResponseText(
  url: URL,
  config: IndexerConfig,
  init: RequestInit = {},
): Effect.Effect<IndexerTextResponse, IndexerError> {
  return Effect.tryPromise({
    try: async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)
      const proxy = config.proxy ?? null
      let dispatcher: Dispatcher | null = null
      try {
        if (proxy?.type === "flaresolverr") {
          const method = (init.method ?? "GET").toUpperCase()
          const postData = bodyText(init.body)
          const headers = headerRecord(init.headers)
          const res = await fetch(flaresolverrEndpoint(proxy), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              cmd: method === "POST" ? "request.post" : "request.get",
              url: url.toString(),
              ...(method === "POST" && postData !== null ? { postData } : {}),
              ...(Object.keys(headers).length > 0 ? { headers } : {}),
              maxTimeout: proxy.settings.flaresolverrTimeoutMs ?? 60_000,
            }),
            signal: controller.signal,
          })
          if (!res.ok) {
            throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
          }
          return parseFlaresolverrResponse(await res.json())
        }

        if (proxy?.type === "socks4" || proxy?.type === "socks5") {
          const res = await fetchTextViaSocksProxy(url, proxy, controller.signal, init)
          if (res.status < 200 || res.status >= 300) {
            throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
          }
          return res
        }

        const built = buildFetchInit(controller.signal, proxy)
        dispatcher = built.dispatcher
        const res = await fetch(url.toString(), {
          ...init,
          ...built.init,
        })
        if (!res.ok) {
          throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
        }
        return {
          status: res.status,
          text: await res.text(),
          headers: res.headers,
        }
      } finally {
        await dispatcher?.close().catch(() => undefined)
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

export function fetchIndexerText(
  url: URL,
  config: IndexerConfig,
  init: RequestInit = {},
): Effect.Effect<string, IndexerError> {
  return fetchIndexerResponseText(url, config, init).pipe(Effect.map((response) => response.text))
}

export function fetchIndexerXml(
  url: URL,
  config: IndexerConfig,
  init: RequestInit = {},
): Effect.Effect<unknown, IndexerError> {
  return fetchIndexerText(url, config, init).pipe(
    Effect.flatMap((text) =>
      Effect.try({
        try: () => xmlParser.parse(text),
        catch: (error) =>
          new IndexerError({
            indexerId: config.id,
            indexerName: config.name,
            reason: "invalid_response",
            message: error instanceof Error ? error.message : "invalid XML response",
            retryable: true,
          }),
      }),
    ),
  )
}

export function checkTorznabError(
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

export function parseTorznabReleases(
  parsed: unknown,
  config: IndexerConfig,
): ReadonlyArray<ReleaseCandidate> {
  const channel = (parsed as Record<string, unknown>)?.rss as Record<string, unknown> | undefined
  const items = (channel?.channel as Record<string, unknown> | undefined)?.item
  if (!Array.isArray(items)) return []

  const protocol = config.protocol
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

export function createTorznabAdapter(config: IndexerConfig): IndexerAdapter {
  return {
    testConnection: () =>
      Effect.gen(function* () {
        const url = buildUrl(config.baseUrl, config.apiKey, { t: "caps" })
        const parsed = yield* fetchIndexerXml(url, config)
        yield* checkTorznabError(parsed, config)
        return parseCaps(parsed)
      }),

    search: (query) =>
      Effect.gen(function* () {
        const params: Record<string, string | number | undefined> = {
          t: SEARCH_TYPE_MAP[query.type] ?? "search",
          q: query.term || undefined,
          limit: query.limit,
          offset: query.offset,
          extended: query.extended,
          cat: query.categories?.join(","),
          imdbid: query.imdbId,
          tmdbid: query.tmdbId,
          tvdbid: query.tvdbId,
          season: query.season,
          ep: query.episode,
        }
        const url = buildUrl(config.baseUrl, config.apiKey, params)
        const parsed = yield* fetchIndexerXml(url, config)
        yield* checkTorznabError(parsed, config)
        return parseTorznabReleases(parsed, config)
      }),
  }
}

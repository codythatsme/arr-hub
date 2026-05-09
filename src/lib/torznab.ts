import type {
  IndexerCapabilities,
  IndexerProtocol,
  ReleaseCandidate,
  SearchQuery,
  SearchType,
} from "#/effect/domain/indexer"

export type AggregateProtocolPath = "torznab" | "newznab"

export interface AggregateCapsRequest {
  readonly kind: "caps"
}

export interface AggregateSearchRequest {
  readonly kind: "search"
  readonly query: SearchQuery
}

export type AggregateIndexerRequest = AggregateCapsRequest | AggregateSearchRequest

export type ParseResult =
  | { readonly ok: true; readonly request: AggregateIndexerRequest }
  | { readonly ok: false; readonly error: string }

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>'

export function protocolFromPath(value: string | undefined): IndexerProtocol | null {
  if (value === "torznab") return "torrent"
  if (value === "newznab") return "usenet"
  return null
}

export function parseAggregateIndexerRequest(url: URL, protocol: IndexerProtocol): ParseResult {
  const t = url.searchParams.get("t")?.toLowerCase() ?? "search"
  if (t === "caps") return { ok: true, request: { kind: "caps" } }

  const type = searchTypeFromTorznab(t)
  if (!type) {
    return { ok: false, error: `unsupported indexer function: ${t}` }
  }

  return {
    ok: true,
    request: {
      kind: "search",
      query: {
        term: url.searchParams.get("q") ?? "",
        type,
        categories: parseCategories(url.searchParams.get("cat")),
        limit: parsePositiveInt(url.searchParams.get("limit")),
        imdbId: normalizeExternalId(url.searchParams.get("imdbid")),
        tmdbId: parsePositiveInt(url.searchParams.get("tmdbid")),
        tvdbId: parsePositiveInt(url.searchParams.get("tvdbid")),
        season: parsePositiveInt(url.searchParams.get("season")),
        episode: parsePositiveInt(url.searchParams.get("ep")),
        protocol,
      },
    },
  }
}

export function buildCapsXml(capabilities: IndexerCapabilities, protocol: IndexerProtocol): string {
  const categoryXml = capabilities.categories
    .map((category) => `    <category id="${category.id}" name="${escapeXml(category.name)}" />`)
    .join("\n")
  const searchTypes = new Set(capabilities.searchTypes)

  return `${XML_DECLARATION}
<caps>
  <server title="ARR Hub" version="1.0" protocol="${protocol}" />
  <limits max="100" default="100" />
  <registration available="no" open="no" />
  <searching>
    <search available="${yesNo(searchTypes.has("search"))}" supportedParams="q" />
    <movie-search available="${yesNo(searchTypes.has("movie"))}" supportedParams="q,imdbid,tmdbid" />
    <tv-search available="${yesNo(searchTypes.has("tvsearch"))}" supportedParams="q,tvdbid,season,ep" />
  </searching>
  <categories>
${categoryXml}
  </categories>
</caps>`
}

export function buildReleaseFeedXml(
  releases: ReadonlyArray<ReleaseCandidate>,
  protocolPath: AggregateProtocolPath,
): string {
  const namespace =
    protocolPath === "torznab"
      ? 'xmlns:torznab="http://torznab.com/schemas/2015/feed"'
      : 'xmlns:newznab="http://www.newznab.com/DTD/2010/feeds/attributes/"'
  const prefix = protocolPath === "torznab" ? "torznab" : "newznab"
  const items = releases.map((release) => releaseItemXml(release, prefix)).join("\n")

  return `${XML_DECLARATION}
<rss version="2.0" ${namespace}>
  <channel>
    <title>ARR Hub Aggregate ${protocolPath}</title>
    <description>Aggregated ARR Hub indexer results</description>
${items}
  </channel>
</rss>`
}

export function buildTorznabErrorXml(code: number, description: string): string {
  return `${XML_DECLARATION}
<error code="${code}" description="${escapeXml(description)}" />`
}

export function xmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

function releaseItemXml(release: ReleaseCandidate, prefix: "torznab" | "newznab"): string {
  const infoUrl = release.infoUrl ?? release.downloadUrl
  const attrs = [
    attr(prefix, "category", release.category),
    attr(prefix, "size", String(release.size)),
    release.seeders === null ? null : attr(prefix, "seeders", String(release.seeders)),
    release.leechers === null ? null : attr(prefix, "peers", String(release.leechers)),
    release.infohash === null ? null : attr(prefix, "infohash", release.infohash),
    attr(prefix, "downloadvolumefactor", String(release.downloadFactor)),
    attr(prefix, "uploadvolumefactor", String(release.uploadFactor)),
  ]
    .filter((item): item is string => item !== null)
    .join("\n")

  return `    <item>
      <title>${escapeXml(release.title)}</title>
      <guid isPermaLink="false">${escapeXml(infoUrl)}</guid>
      <link>${escapeXml(release.downloadUrl)}</link>
      <comments>${escapeXml(infoUrl)}</comments>
      <pubDate>${release.publishedAt.toUTCString()}</pubDate>
      <category>${escapeXml(release.category)}</category>
      <size>${release.size}</size>
${attrs}
    </item>`
}

function attr(prefix: "torznab" | "newznab", name: string, value: string): string {
  return `      <${prefix}:attr name="${escapeXml(name)}" value="${escapeXml(value)}" />`
}

function searchTypeFromTorznab(value: string): SearchType | null {
  if (value === "search") return "general"
  if (value === "movie") return "movie"
  if (value === "tvsearch") return "tv"
  return null
}

function parseCategories(value: string | null): ReadonlyArray<number> | undefined {
  if (!value) return undefined
  const categories = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0)
  return categories.length > 0 ? categories : undefined
}

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function normalizeExternalId(value: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function yesNo(value: boolean): "yes" | "no" {
  return value ? "yes" : "no"
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

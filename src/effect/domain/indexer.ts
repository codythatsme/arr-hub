import type { IndexerError } from "../errors"

/** Runtime-validated by AdapterRegistry. Not a closed union — plugins can extend. */
export type IndexerType = string
export type IndexerProtocol = "torrent" | "usenet"
export type IndexerHealthStatus = "healthy" | "unhealthy" | "unknown"

/** Adapter metadata for registry display + protocol selection. */
export interface IndexerAdapterMetadata {
  readonly displayName: string
  readonly protocolAffinity: IndexerProtocol
  readonly authModel: string
}

export interface ReleaseCandidate {
  readonly title: string
  readonly indexerId: number
  readonly indexerName: string
  readonly indexerPriority: number
  readonly size: number
  readonly seeders: number | null
  readonly leechers: number | null
  readonly age: number
  readonly downloadUrl: string
  readonly infoUrl: string | null
  readonly category: string
  readonly protocol: IndexerProtocol
  readonly publishedAt: Date
  readonly infohash: string | null
  readonly downloadFactor: number
  readonly uploadFactor: number
}

export interface IndexerCapabilities {
  readonly searchTypes: ReadonlyArray<string>
  readonly categories: ReadonlyArray<{ readonly id: number; readonly name: string }>
}

export type SearchType = "movie" | "tv" | "general"

export interface SearchQuery {
  readonly term: string
  readonly type: SearchType
  readonly categories?: ReadonlyArray<number>
  readonly limit?: number
  readonly imdbId?: string
  readonly tmdbId?: number
  readonly tvdbId?: number
  readonly season?: number
  readonly episode?: number
}

export interface SearchResult {
  readonly releases: ReadonlyArray<ReleaseCandidate>
  readonly errors: ReadonlyArray<IndexerError>
}

/** Config shape used by the adapter factory — no DB concerns. */
export interface IndexerConfig {
  readonly id: number
  readonly name: string
  readonly type: IndexerType
  readonly baseUrl: string
  readonly apiKey: string
  readonly priority: number
  readonly categories: ReadonlyArray<number>
  readonly protocol: IndexerProtocol
}

/** Public-facing indexer shape — never exposes raw or encrypted API keys. */
export interface IndexerWithHealth {
  readonly id: number
  readonly name: string
  readonly type: IndexerType
  readonly baseUrl: string
  readonly enabled: boolean
  readonly priority: number
  readonly categories: ReadonlyArray<number>
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly health: {
    readonly lastCheck: Date
    readonly status: IndexerHealthStatus
    readonly errorMessage: string | null
    readonly responseTimeMs: number | null
  } | null
}

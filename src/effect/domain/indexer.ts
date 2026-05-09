import type { IndexerError } from "../errors"

/** Runtime-validated by AdapterRegistry. Not a closed union — plugins can extend. */
export type IndexerType = string
export type IndexerProtocol = "torrent" | "usenet"
export type IndexerHealthStatus = "healthy" | "unhealthy" | "unknown"
export type IndexerDefinitionImplementation = "torznab" | "newznab" | "cardigann_yaml"
export type IndexerPrivacy = "public" | "private" | "semi_private"
export type IndexerProxyType = "http" | "socks4" | "socks5" | "flaresolverr"
export type IndexerAuthFieldType = "text" | "password" | "cookie" | "textarea"

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

export interface IndexerAuthField {
  readonly name: string
  readonly label: string
  readonly type: IndexerAuthFieldType
  readonly required: boolean
  readonly helpText?: string
}

export interface IndexerCategoryMapping {
  readonly trackerCategory: string
  readonly trackerCategoryDesc: string
  readonly newznabCategory: number
}

export interface IndexerDefinitionSeed {
  readonly definitionKey: string
  readonly displayName: string
  readonly protocol: IndexerProtocol
  readonly implementation: IndexerDefinitionImplementation
  readonly baseUrl: string | null
  readonly privacy: IndexerPrivacy
  readonly supportsRss: boolean
  readonly supportsSearch: boolean
  readonly authFields: ReadonlyArray<IndexerAuthField>
  readonly categories: ReadonlyArray<IndexerCategoryMapping>
  readonly capabilities: IndexerCapabilities
  readonly tags: ReadonlyArray<string>
  readonly version: string
  readonly sourceYaml?: string | null
}

export interface IndexerDefinition extends IndexerDefinitionSeed {
  readonly id: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export type IndexerDefinitionSyncAction = "created" | "updated" | "unchanged"

export interface IndexerDefinitionSyncItem {
  readonly definitionKey: string
  readonly displayName: string
  readonly previousVersion: string | null
  readonly version: string
  readonly action: IndexerDefinitionSyncAction
}

export interface IndexerDefinitionSyncResult {
  readonly total: number
  readonly created: number
  readonly updated: number
  readonly unchanged: number
  readonly refreshedAt: Date
  readonly definitions: ReadonlyArray<IndexerDefinitionSyncItem>
}

export interface IndexerProxySettings {
  readonly tags?: ReadonlyArray<string>
  readonly flaresolverrTimeoutMs?: number
}

export interface IndexerProxy {
  readonly id: number
  readonly name: string
  readonly type: IndexerProxyType
  readonly host: string
  readonly port: number | null
  readonly username: string | null
  readonly enabled: boolean
  readonly settings: IndexerProxySettings
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface IndexerOutboundProxy {
  readonly type: IndexerProxyType
  readonly host: string
  readonly port: number | null
  readonly username: string | null
  readonly password: string | null
  readonly settings: IndexerProxySettings
}

export interface IndexerStats {
  readonly indexerId: number
  readonly indexerName: string
  readonly totalSearches: number
  readonly successfulSearches: number
  readonly failedSearches: number
  readonly totalRss: number
  readonly successfulRss: number
  readonly failedRss: number
  readonly averageResponseTimeMs: number | null
  readonly lastSearchAt: Date | null
  readonly lastRssAt: Date | null
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
  readonly protocol?: IndexerProtocol
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
  readonly definitionKey?: string | null
  readonly definitionYaml?: string | null
  readonly baseUrl: string
  readonly apiKey: string
  readonly priority: number
  readonly categories: ReadonlyArray<number>
  readonly protocol: IndexerProtocol
  readonly proxy?: IndexerOutboundProxy | null
}

/** Public-facing indexer shape — never exposes raw or encrypted API keys. */
export interface IndexerWithHealth {
  readonly id: number
  readonly name: string
  readonly type: IndexerType
  readonly definitionKey: string | null
  readonly baseUrl: string
  readonly proxyId: number | null
  readonly enabled: boolean
  readonly searchEnabled: boolean
  readonly rssEnabled: boolean
  readonly priority: number
  readonly minimumSeeders: number | null
  readonly queryCooldownSeconds: number | null
  readonly categories: ReadonlyArray<number>
  readonly tags: ReadonlyArray<string>
  readonly capabilities: IndexerCapabilities | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly health: {
    readonly lastCheck: Date
    readonly status: IndexerHealthStatus
    readonly errorMessage: string | null
    readonly responseTimeMs: number | null
  } | null
}

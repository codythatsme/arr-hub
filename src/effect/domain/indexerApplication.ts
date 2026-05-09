import type { IndexerProtocol } from "./indexer"

export type IndexerApplicationType = "radarr" | "sonarr"
export type IndexerApplicationSyncLevel = "add_only" | "full"

export interface IndexerApplicationSettings {
  readonly syncCategories?: ReadonlyArray<number>
  readonly syncLevel?: IndexerApplicationSyncLevel
  readonly enableRss?: boolean
  readonly enableAutomaticSearch?: boolean
  readonly enableInteractiveSearch?: boolean
  readonly priority?: number
}

export interface IndexerApplicationMapping {
  readonly id: number
  readonly applicationId: number
  readonly protocol: IndexerProtocol
  readonly remoteIndexerId: number
  readonly remoteIndexerName: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface IndexerApplication {
  readonly id: number
  readonly name: string
  readonly type: IndexerApplicationType
  readonly baseUrl: string
  readonly syncBaseUrl: string
  readonly enabled: boolean
  readonly settings: IndexerApplicationSettings
  readonly lastSyncedAt: Date | null
  readonly lastError: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly mappings: ReadonlyArray<IndexerApplicationMapping>
}

export type IndexerApplicationSyncAction = "created" | "updated" | "skipped"

export interface IndexerApplicationSyncItem {
  readonly protocol: IndexerProtocol
  readonly action: IndexerApplicationSyncAction
  readonly remoteIndexerId: number | null
  readonly remoteIndexerName: string | null
  readonly categories: ReadonlyArray<number>
  readonly reason?: string
}

export interface IndexerApplicationSyncResult {
  readonly applicationId: number
  readonly syncedAt: Date
  readonly created: number
  readonly updated: number
  readonly skipped: number
  readonly items: ReadonlyArray<IndexerApplicationSyncItem>
}

import type { IndexerDefinitionSyncAction } from "./indexer"

export interface IndexerDefinitionSource {
  readonly id: number
  readonly name: string
  readonly url: string
  readonly enabled: boolean
  readonly lastCheckedAt: Date | null
  readonly lastError: string | null
  readonly lastDefinitionKey: string | null
  readonly lastVersion: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface IndexerDefinitionSourceRefreshResult {
  readonly sourceId: number
  readonly refreshedAt: Date
  readonly definitionKey: string
  readonly displayName: string
  readonly previousVersion: string | null
  readonly version: string
  readonly action: IndexerDefinitionSyncAction
}

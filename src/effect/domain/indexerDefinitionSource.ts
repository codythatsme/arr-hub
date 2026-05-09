import type { IndexerDefinitionSyncAction } from "./indexer"

export interface IndexerDefinitionSource {
  readonly id: number
  readonly name: string
  readonly url: string
  readonly enabled: boolean
  readonly pinnedSha256: string | null
  readonly lastCheckedAt: Date | null
  readonly lastError: string | null
  readonly lastDefinitionKey: string | null
  readonly lastVersion: string | null
  readonly lastSha256: string | null
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
  readonly sourceSha256: string
  readonly action: IndexerDefinitionSyncAction
}

export interface IndexerDefinitionSourceRefreshFailure {
  readonly sourceId: number
  readonly sourceName: string
  readonly message: string
  readonly reason: "connection_failed" | "invalid_response" | "sync_failed" | "checksum_mismatch"
  readonly retryable: boolean
}

export interface IndexerDefinitionSourceRefreshSummary {
  readonly refreshedAt: Date
  readonly total: number
  readonly succeeded: number
  readonly failed: number
  readonly results: ReadonlyArray<IndexerDefinitionSourceRefreshResult>
  readonly errors: ReadonlyArray<IndexerDefinitionSourceRefreshFailure>
}

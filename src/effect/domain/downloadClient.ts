import type { IndexerProtocol } from "./indexer"

export type DownloadProtocol = IndexerProtocol

/** Runtime-validated by AdapterRegistry. Not a closed union — plugins can extend. */
export type DownloadClientType = string

export type NormalizedDownloadStatus =
  | "queued"
  | "downloading"
  | "importing"
  | "completed"
  | "failed"

export type DownloadClientHealthStatus = "healthy" | "unhealthy" | "unknown"

export interface DownloadClientSettings {
  readonly pollIntervalMs: number
}

/** Config shape used by the adapter factory — no DB concerns. */
export interface DownloadClientConfig {
  readonly id: number
  readonly name: string
  readonly type: DownloadClientType
  readonly host: string
  readonly port: number
  readonly username: string
  readonly password: string
  readonly useSsl: boolean
  readonly category: string | null
  readonly settings: DownloadClientSettings
}

export interface DownloadStatus {
  readonly externalId: string
  readonly title: string
  readonly status: NormalizedDownloadStatus
  readonly sizeBytes: number
  readonly progressFraction: number
  readonly etaSeconds: number | null
  readonly errorMessage: string | null
  readonly downloadClientId: number
}

export interface DownloadClientHealth {
  readonly connected: boolean
  readonly version: string | null
  readonly freeSpaceBytes: number | null
  readonly errorMessage: string | null
}

export interface AddDownloadOptions {
  readonly category?: string
  readonly savePath?: string
}

/** Adapter metadata for registry display + protocol selection. */
export interface AdapterMetadata {
  readonly displayName: string
  readonly protocolAffinity: DownloadProtocol | "any"
  readonly defaultPort: number
  readonly authModel: string
}

/** Public-facing shape — never exposes password. */
export interface DownloadClientWithHealth {
  readonly id: number
  readonly name: string
  readonly type: DownloadClientType
  readonly host: string
  readonly port: number
  readonly username: string
  readonly useSsl: boolean
  readonly category: string | null
  readonly priority: number
  readonly enabled: boolean
  readonly settings: DownloadClientSettings
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly health: {
    readonly lastCheck: Date
    readonly status: DownloadClientHealthStatus
    readonly errorMessage: string | null
    readonly responseTimeMs: number | null
  } | null
}

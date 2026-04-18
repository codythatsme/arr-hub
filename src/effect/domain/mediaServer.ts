/** Runtime-validated by AdapterRegistry. Not a closed union — plugins can extend. */
export type MediaServerType = string

/** Adapter metadata for registry display. */
export interface MediaServerAdapterMetadata {
  readonly displayName: string
  readonly defaultPort: number
  readonly authModel: string
}

export type MediaServerHealthStatus = "healthy" | "unhealthy" | "unknown"

export type MediaServerLibraryType = "movie" | "show"

export interface MediaServerSettings {
  readonly syncIntervalMs: number
  readonly monitoringEnabled: boolean
}

/** Config shape used by the adapter factory — no DB concerns. */
export interface MediaServerConfig {
  readonly id: number
  readonly name: string
  readonly type: MediaServerType
  readonly host: string
  readonly port: number
  readonly token: string
  readonly useSsl: boolean
  readonly settings: MediaServerSettings
}

export interface MediaServerConnectionInfo {
  readonly serverName: string
  readonly version: string
  readonly machineId: string
}

export interface MediaServerLibrary {
  readonly externalId: string
  readonly name: string
  readonly type: MediaServerLibraryType
}

// ── GUID extraction ──

export interface ParsedGuid {
  readonly tmdbId: number | null
  readonly tvdbId: number | null
  readonly imdbId: string | null
}

// ── Synced items (discriminated union) ──

export interface SyncedMovieItem {
  readonly title: string
  readonly year: number | null
  readonly tmdbId: number | null
  readonly filePath: string | null
}

export interface SyncedEpisodeItem {
  readonly title: string
  readonly seasonNumber: number
  readonly episodeNumber: number
  readonly seriesTvdbId: number | null
  readonly filePath: string | null
}

export type SyncedItem =
  | { readonly kind: "movie"; readonly item: SyncedMovieItem }
  | { readonly kind: "episode"; readonly item: SyncedEpisodeItem }

// ── Health ──

export interface MediaServerHealth {
  readonly connected: boolean
  readonly serverName: string | null
  readonly version: string | null
  readonly libraryCount: number | null
  readonly errorMessage: string | null
}

/** Public-facing shape — never exposes token. */
export interface MediaServerWithHealth {
  readonly id: number
  readonly name: string
  readonly type: MediaServerType
  readonly host: string
  readonly port: number
  readonly useSsl: boolean
  readonly enabled: boolean
  readonly settings: MediaServerSettings
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly health: {
    readonly lastCheck: Date
    readonly status: MediaServerHealthStatus
    readonly errorMessage: string | null
    readonly responseTimeMs: number | null
  } | null
}

export interface SyncResult {
  readonly matched: number
  readonly unmatched: number
  readonly libraryId: string
}

// ── Active sessions (Plex-shaped today; Jellyfin returns []) ──

export type SessionState = "playing" | "paused" | "buffering"

export type SessionMediaType = "movie" | "episode"

export type TranscodeDecision = "direct_play" | "direct_stream" | "transcode"

export interface MediaServerSession {
  readonly mediaServerId: number
  readonly sessionKey: string
  readonly ratingKey: string
  readonly userId: string
  readonly username: string
  readonly userThumb: string | null
  readonly state: SessionState
  readonly mediaType: SessionMediaType
  readonly title: string
  readonly parentTitle: string | null
  readonly grandparentTitle: string | null
  readonly year: number | null
  readonly thumb: string | null
  readonly viewOffset: number
  readonly duration: number
  readonly progressPercent: number
  readonly transcodeDecision: TranscodeDecision
  readonly videoResolution: string | null
  readonly audioCodec: string | null
  readonly player: string
  readonly platform: string
  readonly product: string | null
  readonly ipAddress: string | null
  readonly bandwidth: number | null
  readonly isLocal: boolean
  readonly startedAt: Date
  readonly updatedAt: Date
  /** Parsed from media-server metadata (Plex Guid / Jellyfin ProviderIds); used to FK-link history rows. */
  readonly tmdbId: number | null
  readonly tvdbId: number | null
}

export interface MediaServerLibraryWithSync {
  readonly id: number
  readonly mediaServerId: number
  readonly externalId: string
  readonly name: string
  readonly type: MediaServerLibraryType
  readonly enabled: boolean
  readonly lastSynced: Date | null
}

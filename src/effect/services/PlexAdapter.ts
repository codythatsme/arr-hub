import { Effect } from "effect"

import type {
  MediaServerAdapterMetadata,
  MediaServerConfig,
  MediaServerConnectionInfo,
  MediaServerHealth,
  MediaServerLibrary,
  MediaServerLibraryType,
  MediaServerSession,
  MediaServerSharedUser,
  SessionMediaType,
  SessionState,
  SyncedItem,
  TranscodeDecision,
} from "../domain/mediaServer"
import { MediaServerError, type MediaServerErrorReason } from "../errors"
import type { MediaServerAdapter } from "./MediaServerAdapter"
import { parseGuids } from "./MediaServerAdapter"

// ── Metadata ──

export const plexMetadata: MediaServerAdapterMetadata = {
  displayName: "Plex",
  defaultPort: 32400,
  authModel: "token",
}

// ── Helpers ──

function baseUrl(config: MediaServerConfig): string {
  const scheme = config.useSsl ? "https" : "http"
  return `${scheme}://${config.host}:${config.port}`
}

function makeError(
  config: MediaServerConfig,
  reason: MediaServerErrorReason,
  message: string,
  retryable: boolean,
): MediaServerError {
  return new MediaServerError({
    serverId: config.id,
    serverName: config.name,
    reason,
    message,
    retryable,
  })
}

// ── Plex API response types ──

interface PlexIdentity {
  readonly MediaContainer: {
    readonly machineIdentifier: string
    readonly version: string
  }
}

interface PlexServerRoot {
  readonly MediaContainer: {
    readonly friendlyName?: string
  }
}

interface PlexLibrarySections {
  readonly MediaContainer: {
    readonly Directory: ReadonlyArray<{
      readonly key: string
      readonly title: string
      readonly type: string
    }>
  }
}

interface PlexGuid {
  readonly id: string
}

interface PlexMediaPart {
  readonly file?: string
}

interface PlexMedia {
  readonly Part?: ReadonlyArray<PlexMediaPart>
}

interface PlexMetadata {
  readonly title: string
  readonly year?: number
  readonly parentIndex?: number
  readonly index?: number
  readonly Guid?: ReadonlyArray<PlexGuid>
  readonly grandparentGuid?: string
  readonly Media?: ReadonlyArray<PlexMedia>
}

interface PlexLibraryItems {
  readonly MediaContainer: {
    readonly Metadata?: ReadonlyArray<PlexMetadata>
  }
}

// ── /status/sessions ──

interface PlexSessionUser {
  readonly id?: string
  readonly title?: string
  readonly thumb?: string
}

interface PlexSessionPlayer {
  readonly state?: string
  readonly title?: string
  readonly platform?: string
  readonly product?: string
  readonly address?: string
  readonly local?: boolean
}

interface PlexSessionSession {
  readonly id?: string
  readonly bandwidth?: number
}

interface PlexSessionStream {
  readonly streamType: number
  readonly codec?: string
}

interface PlexSessionMediaPart {
  readonly Stream?: ReadonlyArray<PlexSessionStream>
}

interface PlexSessionMedia {
  readonly videoResolution?: string
  readonly audioCodec?: string
  readonly Part?: ReadonlyArray<PlexSessionMediaPart>
}

interface PlexSessionTranscode {
  readonly videoDecision?: string
  readonly audioDecision?: string
}

interface PlexSessionMetadata {
  readonly sessionKey: string
  readonly ratingKey: string
  readonly type: string
  readonly title: string
  readonly parentTitle?: string
  readonly grandparentTitle?: string
  readonly year?: number
  readonly thumb?: string
  readonly viewOffset?: number
  readonly duration?: number
  readonly addedAt?: number
  readonly Guid?: ReadonlyArray<PlexGuid>
  readonly User?: PlexSessionUser
  readonly Player?: PlexSessionPlayer
  readonly Session?: PlexSessionSession
  readonly Media?: ReadonlyArray<PlexSessionMedia>
  readonly TranscodeSession?: PlexSessionTranscode
}

interface PlexStatusSessions {
  readonly MediaContainer: {
    readonly Metadata?: ReadonlyArray<PlexSessionMetadata>
  }
}

// ── /accounts ──

interface PlexAccount {
  readonly id: number
  readonly key?: string
  readonly name?: string
  readonly defaultAudioLanguage?: string
  readonly autoSelectAudio?: boolean
  readonly defaultSubtitleLanguage?: string
  readonly subtitleMode?: number
  readonly thumb?: string
}

interface PlexAccounts {
  readonly MediaContainer: {
    readonly Account?: ReadonlyArray<PlexAccount>
  }
}

const SESSION_STATE_MAP: Record<string, SessionState> = {
  playing: "playing",
  paused: "paused",
  buffering: "buffering",
}

const SESSION_TYPE_MAP: Record<string, SessionMediaType> = {
  movie: "movie",
  episode: "episode",
}

function mapTranscodeDecision(transcode: PlexSessionTranscode | undefined): TranscodeDecision {
  if (!transcode) return "direct_play"
  const isTranscoded =
    transcode.videoDecision === "transcode" || transcode.audioDecision === "transcode"
  if (isTranscoded) return "transcode"
  const isCopied = transcode.videoDecision === "copy" || transcode.audioDecision === "copy"
  if (isCopied) return "direct_stream"
  return "direct_play"
}

function mapPlexSession(
  serverId: number,
  m: PlexSessionMetadata,
  now: Date,
): MediaServerSession | null {
  const state = SESSION_STATE_MAP[m.Player?.state ?? "playing"]
  const mediaType = SESSION_TYPE_MAP[m.type]
  if (!state || !mediaType) return null

  const media = m.Media?.[0]
  const audioStream = media?.Part?.[0]?.Stream?.find((s) => s.streamType === 2)
  const duration = m.duration ?? 0
  const viewOffset = m.viewOffset ?? 0
  const startedAt = m.addedAt ? new Date(m.addedAt * 1000) : now
  const guids = parseGuids(m.Guid ?? [])

  return {
    mediaServerId: serverId,
    sessionKey: m.sessionKey,
    ratingKey: m.ratingKey,
    userId: m.User?.id ?? "",
    username: m.User?.title ?? "",
    userThumb: m.User?.thumb ?? null,
    state,
    mediaType,
    title: m.title,
    parentTitle: m.parentTitle ?? null,
    grandparentTitle: m.grandparentTitle ?? null,
    year: m.year ?? null,
    thumb: m.thumb ?? null,
    viewOffset,
    duration,
    progressPercent: duration > 0 ? Math.min(100, (viewOffset / duration) * 100) : 0,
    transcodeDecision: mapTranscodeDecision(m.TranscodeSession),
    videoResolution: media?.videoResolution ?? null,
    audioCodec: media?.audioCodec ?? audioStream?.codec ?? null,
    player: m.Player?.title ?? "",
    platform: m.Player?.platform ?? "",
    product: m.Player?.product ?? null,
    ipAddress: m.Player?.address ?? null,
    bandwidth: m.Session?.bandwidth ?? null,
    isLocal: m.Player?.local ?? false,
    startedAt,
    updatedAt: now,
    tmdbId: guids.tmdbId,
    tvdbId: guids.tvdbId,
  }
}

// ── Plex library type mapping ──

const PLEX_TYPE_MAP: Record<string, MediaServerLibraryType> = {
  movie: "movie",
  show: "show",
}

const extractFilePath = (metadata: PlexMetadata): string | null =>
  metadata.Media?.[0]?.Part?.[0]?.file ?? null

// ── Factory ──

export function createPlexAdapter(config: MediaServerConfig): MediaServerAdapter {
  const base = baseUrl(config)

  const plexFetch = (path: string): Effect.Effect<Response, MediaServerError> =>
    Effect.tryPromise({
      try: async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)
        try {
          const res = await fetch(`${base}${path}`, {
            headers: {
              Accept: "application/json",
              "X-Plex-Token": config.token,
              "X-Plex-Client-Identifier": "arr-hub",
              "X-Plex-Product": "ARR Hub",
            },
            signal: controller.signal,
          })
          if (res.status === 401 || res.status === 403) {
            throw Object.assign(new Error("auth failed"), { authFailed: true })
          }
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          return res
        } finally {
          clearTimeout(timeout)
        }
      },
      catch: (e) => {
        if (e instanceof Error && e.name === "AbortError") {
          return makeError(config, "timeout", `request to ${path} timed out after 15s`, true)
        }
        if ((e as Record<string, unknown>).authFailed) {
          return makeError(config, "auth_failed", "invalid or expired Plex token", false)
        }
        return makeError(
          config,
          "connection_refused",
          e instanceof Error ? e.message : "request failed",
          true,
        )
      },
    })

  const plexJson = <T>(path: string): Effect.Effect<T, MediaServerError> =>
    Effect.gen(function* () {
      const res = yield* plexFetch(path)
      return yield* Effect.tryPromise({
        try: () => res.json() as Promise<T>,
        catch: () =>
          makeError(config, "invalid_response", `failed to parse JSON from ${path}`, false),
      })
    })

  return {
    testConnection: (): Effect.Effect<MediaServerConnectionInfo, MediaServerError> =>
      Effect.gen(function* () {
        const identity = yield* plexJson<PlexIdentity>("/identity")
        const root = yield* plexJson<PlexServerRoot>("/")

        return {
          serverName: root.MediaContainer.friendlyName ?? config.name,
          version: identity.MediaContainer.version,
          machineId: identity.MediaContainer.machineIdentifier,
        }
      }),

    getLibraries: () =>
      Effect.gen(function* () {
        const sections = yield* plexJson<PlexLibrarySections>("/library/sections")
        const dirs = sections.MediaContainer.Directory ?? []

        return dirs.flatMap((dir): ReadonlyArray<MediaServerLibrary> => {
          const type = PLEX_TYPE_MAP[dir.type]
          if (!type) return []
          return [{ externalId: dir.key, name: dir.title, type }]
        })
      }),

    syncLibrary: (libraryId) =>
      Effect.gen(function* () {
        // First determine library type by checking sections
        const sections = yield* plexJson<PlexLibrarySections>("/library/sections")
        const dir = sections.MediaContainer.Directory?.find((d) => d.key === libraryId)
        if (!dir) {
          return yield* makeError(
            config,
            "library_not_found",
            `library ${libraryId} not found`,
            false,
          )
        }

        const libraryType = PLEX_TYPE_MAP[dir.type]
        if (!libraryType) {
          return yield* makeError(
            config,
            "invalid_response",
            `unsupported library type: ${dir.type}`,
            false,
          )
        }

        if (libraryType === "movie") {
          const items = yield* plexJson<PlexLibraryItems>(`/library/sections/${libraryId}/all`)
          const metadata = items.MediaContainer.Metadata ?? []

          return metadata.map((m): SyncedItem => {
            const guids = parseGuids(m.Guid ?? [])
            return {
              kind: "movie",
              item: {
                title: m.title,
                year: m.year ?? null,
                tmdbId: guids.tmdbId,
                filePath: extractFilePath(m),
              },
            }
          })
        }

        // Show library: fetch episodes (type=4)
        const items = yield* plexJson<PlexLibraryItems>(`/library/sections/${libraryId}/all?type=4`)
        const metadata = items.MediaContainer.Metadata ?? []

        return metadata.map((m): SyncedItem => {
          // grandparentGuid contains series-level GUIDs
          const seriesGuids = m.grandparentGuid
            ? parseGuids([{ id: m.grandparentGuid }])
            : parseGuids(m.Guid ?? [])

          return {
            kind: "episode",
            item: {
              title: m.title,
              seasonNumber: m.parentIndex ?? 0,
              episodeNumber: m.index ?? 0,
              seriesTvdbId: seriesGuids.tvdbId,
              filePath: extractFilePath(m),
            },
          }
        })
      }),

    refreshLibrary: (libraryId, path) =>
      Effect.gen(function* () {
        yield* plexFetch(`/library/sections/${libraryId}/refresh?path=${encodeURIComponent(path)}`)
      }),

    getActiveSessions: (): Effect.Effect<ReadonlyArray<MediaServerSession>, MediaServerError> =>
      Effect.gen(function* () {
        const sessions = yield* plexJson<PlexStatusSessions>("/status/sessions")
        const metadata = sessions.MediaContainer.Metadata ?? []
        const now = new Date()
        return metadata.flatMap((m): ReadonlyArray<MediaServerSession> => {
          const mapped = mapPlexSession(config.id, m, now)
          return mapped ? [mapped] : []
        })
      }),

    getSharedUsers: (): Effect.Effect<ReadonlyArray<MediaServerSharedUser>, MediaServerError> =>
      Effect.gen(function* () {
        const accounts = yield* plexJson<PlexAccounts>("/accounts")
        const list = accounts.MediaContainer.Account ?? []
        return list.flatMap((a): ReadonlyArray<MediaServerSharedUser> => {
          // id=0 is the "Local" anonymous pseudo-account — skip.
          if (a.id === 0) return []
          const name = a.name ?? `user-${a.id}`
          return [
            {
              plexUserId: String(a.id),
              username: name,
              friendlyName: name,
              email: null,
              thumb: a.thumb ?? null,
              // id=1 is the server owner in Plex.
              isAdmin: a.id === 1,
            },
          ]
        })
      }),

    getHealth: (): Effect.Effect<MediaServerHealth, MediaServerError> =>
      Effect.gen(function* () {
        const identity = yield* plexJson<PlexIdentity>("/identity").pipe(
          Effect.catchAll(() => Effect.succeed(null as PlexIdentity | null)),
        )

        if (!identity) {
          return {
            connected: false,
            serverName: null,
            version: null,
            libraryCount: null,
            errorMessage: "failed to connect",
          }
        }

        const sections = yield* plexJson<PlexLibrarySections>("/library/sections").pipe(
          Effect.catchAll(() => Effect.succeed(null as PlexLibrarySections | null)),
        )

        const libraryCount =
          sections?.MediaContainer.Directory?.filter((d) => d.type === "movie" || d.type === "show")
            .length ?? null

        return {
          connected: true,
          serverName: config.name,
          version: identity.MediaContainer.version,
          libraryCount,
          errorMessage: null,
        }
      }),
  }
}

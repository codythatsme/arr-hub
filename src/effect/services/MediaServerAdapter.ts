import { Effect } from "effect"

import type {
  MediaServerConfig,
  MediaServerConnectionInfo,
  MediaServerHealth,
  MediaServerLibrary,
  MediaServerLibraryType,
  ParsedGuid,
  SyncedItem,
} from "../domain/mediaServer"
import { MediaServerError, type MediaServerErrorReason } from "../errors"

// ── Interface ──

export interface MediaServerAdapter {
  readonly testConnection: () => Effect.Effect<MediaServerConnectionInfo, MediaServerError>
  readonly getLibraries: () => Effect.Effect<ReadonlyArray<MediaServerLibrary>, MediaServerError>
  readonly syncLibrary: (
    libraryId: string,
  ) => Effect.Effect<ReadonlyArray<SyncedItem>, MediaServerError>
  readonly refreshLibrary: (
    libraryId: string,
    path: string,
  ) => Effect.Effect<void, MediaServerError>
  readonly getHealth: () => Effect.Effect<MediaServerHealth, MediaServerError>
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

// ── GUID extraction (from Sonarr/Radarr PlexParser.cs pattern) ──

const TMDB_RE = /tmdb:\/\/(\d+)/
const TVDB_RE = /tvdb:\/\/(\d+)/
const IMDB_RE = /imdb:\/\/(tt\d+)/

export function parseGuids(guids: ReadonlyArray<{ readonly id: string }>): ParsedGuid {
  let tmdbId: number | null = null
  let tvdbId: number | null = null
  let imdbId: string | null = null

  for (const guid of guids) {
    const tmdbMatch = TMDB_RE.exec(guid.id)
    if (tmdbMatch) tmdbId = Number(tmdbMatch[1])

    const tvdbMatch = TVDB_RE.exec(guid.id)
    if (tvdbMatch) tvdbId = Number(tvdbMatch[1])

    const imdbMatch = IMDB_RE.exec(guid.id)
    if (imdbMatch) imdbId = imdbMatch[1]
  }

  return { tmdbId, tvdbId, imdbId }
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

// ── Plex library type mapping ──

const PLEX_TYPE_MAP: Record<string, MediaServerLibraryType> = {
  movie: "movie",
  show: "show",
}

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

  const extractFilePath = (metadata: PlexMetadata): string | null =>
    metadata.Media?.[0]?.Part?.[0]?.file ?? null

  return {
    testConnection: () =>
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
          const items = yield* plexJson<PlexLibraryItems>(
            `/library/sections/${libraryId}/all`,
          )
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
        const items = yield* plexJson<PlexLibraryItems>(
          `/library/sections/${libraryId}/all?type=4`,
        )
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
        yield* plexFetch(
          `/library/sections/${libraryId}/refresh?path=${encodeURIComponent(path)}`,
        )
      }),

    getHealth: () =>
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

        const libraryCount = sections?.MediaContainer.Directory?.filter(
          (d) => d.type === "movie" || d.type === "show",
        ).length ?? null

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

import { Effect } from "effect"

import type {
  MediaServerAdapterMetadata,
  MediaServerConfig,
  MediaServerConnectionInfo,
  MediaServerHealth,
  MediaServerLibrary,
  MediaServerLibraryType,
  SyncedItem,
} from "../domain/mediaServer"
import { MediaServerError, type MediaServerErrorReason } from "../errors"
import type { MediaServerAdapter } from "./MediaServerAdapter"

// ── Metadata ──

export const jellyfinMetadata: MediaServerAdapterMetadata = {
  displayName: "Jellyfin",
  defaultPort: 8096,
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

// ── Jellyfin API response types ──

interface JellyfinSystemInfo {
  readonly ServerName: string
  readonly Version: string
  readonly Id: string
}

interface JellyfinLibraryFolder {
  readonly Id: string
  readonly Name: string
  readonly CollectionType?: string
}

interface JellyfinLibraryFolders {
  readonly Items: ReadonlyArray<JellyfinLibraryFolder>
}

interface JellyfinItem {
  readonly Name: string
  readonly ProductionYear?: number
  readonly ParentIndexNumber?: number
  readonly IndexNumber?: number
  readonly Path?: string
  readonly ProviderIds?: Partial<Record<string, string>>
  readonly SeriesId?: string
}

interface JellyfinItems {
  readonly Items: ReadonlyArray<JellyfinItem>
}

// ── Jellyfin library type mapping ──

const JELLYFIN_TYPE_MAP: Record<string, MediaServerLibraryType> = {
  movies: "movie",
  tvshows: "show",
}

// ── Provider ID extraction ──

function extractProviderIds(providerIds: Partial<Record<string, string>> | undefined): {
  tmdbId: number | null
  tvdbId: number | null
  imdbId: string | null
} {
  if (!providerIds) {
    return { tmdbId: null, tvdbId: null, imdbId: null }
  }

  const tmdbRaw = providerIds["Tmdb"]
  const tvdbRaw = providerIds["Tvdb"]
  const imdbRaw = providerIds["Imdb"]

  const tmdbParsed = tmdbRaw ? Number(tmdbRaw) : Number.NaN
  const tvdbParsed = tvdbRaw ? Number(tvdbRaw) : Number.NaN

  return {
    tmdbId: Number.isFinite(tmdbParsed) ? tmdbParsed : null,
    tvdbId: Number.isFinite(tvdbParsed) ? tvdbParsed : null,
    imdbId: imdbRaw ?? null,
  }
}

// ── Factory ──

export function createJellyfinAdapter(config: MediaServerConfig): MediaServerAdapter {
  const base = baseUrl(config)

  const authHeader = `MediaBrowser Client="ARR Hub", Device="Server", DeviceId="arr-hub", Version="1.0", Token="${config.token}"`

  const jellyfinFetch = (
    path: string,
    method: "GET" | "POST" = "GET",
  ): Effect.Effect<Response, MediaServerError> =>
    Effect.tryPromise({
      try: async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)
        try {
          const res = await fetch(`${base}${path}`, {
            method,
            headers: {
              Accept: "application/json",
              Authorization: authHeader,
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
        if (e instanceof Error && "authFailed" in e) {
          return makeError(config, "auth_failed", "invalid or expired Jellyfin token", false)
        }
        return makeError(
          config,
          "connection_refused",
          e instanceof Error ? e.message : "request failed",
          true,
        )
      },
    })

  const jellyfinJson = <T>(path: string): Effect.Effect<T, MediaServerError> =>
    Effect.gen(function* () {
      const res = yield* jellyfinFetch(path)
      return yield* Effect.tryPromise({
        try: () => res.json() as Promise<T>,
        catch: () =>
          makeError(config, "invalid_response", `failed to parse JSON from ${path}`, false),
      })
    })

  return {
    testConnection: (): Effect.Effect<MediaServerConnectionInfo, MediaServerError> =>
      Effect.gen(function* () {
        const info = yield* jellyfinJson<JellyfinSystemInfo>("/System/Info")

        return {
          serverName: info.ServerName,
          version: info.Version,
          machineId: info.Id,
        }
      }),

    getLibraries: () =>
      Effect.gen(function* () {
        const folders = yield* jellyfinJson<JellyfinLibraryFolders>("/Library/MediaFolders")

        return folders.Items.flatMap((folder): ReadonlyArray<MediaServerLibrary> => {
          const collectionType = folder.CollectionType
          if (!collectionType) return []
          const type = JELLYFIN_TYPE_MAP[collectionType]
          if (!type) return []
          return [{ externalId: folder.Id, name: folder.Name, type }]
        })
      }),

    syncLibrary: (libraryId) =>
      Effect.gen(function* () {
        // Determine library type from media folders
        const folders = yield* jellyfinJson<JellyfinLibraryFolders>("/Library/MediaFolders")
        const folder = folders.Items.find((f) => f.Id === libraryId)
        if (!folder) {
          return yield* makeError(
            config,
            "library_not_found",
            `library ${libraryId} not found`,
            false,
          )
        }

        const collectionType = folder.CollectionType
        if (!collectionType) {
          return yield* makeError(
            config,
            "invalid_response",
            `library ${libraryId} has no collection type`,
            false,
          )
        }

        const libraryType = JELLYFIN_TYPE_MAP[collectionType]
        if (!libraryType) {
          return yield* makeError(
            config,
            "invalid_response",
            `unsupported library type: ${collectionType}`,
            false,
          )
        }

        if (libraryType === "movie") {
          const result = yield* jellyfinJson<JellyfinItems>(
            `/Items?parentId=${libraryId}&includeItemTypes=Movie&fields=ProviderIds,Path,MediaSources&recursive=true`,
          )

          return result.Items.map((item): SyncedItem => {
            const ids = extractProviderIds(item.ProviderIds)
            return {
              kind: "movie",
              item: {
                title: item.Name,
                year: item.ProductionYear ?? null,
                tmdbId: ids.tmdbId,
                filePath: item.Path ?? null,
              },
            }
          })
        }

        // Show library: fetch episodes
        const result = yield* jellyfinJson<JellyfinItems>(
          `/Items?parentId=${libraryId}&includeItemTypes=Episode&fields=ProviderIds,Path,MediaSources&recursive=true`,
        )

        return result.Items.map((item): SyncedItem => {
          const ids = extractProviderIds(item.ProviderIds)
          return {
            kind: "episode",
            item: {
              title: item.Name,
              seasonNumber: item.ParentIndexNumber ?? 0,
              episodeNumber: item.IndexNumber ?? 0,
              seriesTvdbId: ids.tvdbId,
              filePath: item.Path ?? null,
            },
          }
        })
      }),

    refreshLibrary: (_libraryId, _path) =>
      Effect.gen(function* () {
        yield* jellyfinFetch("/Library/Refresh", "POST")
      }),

    getHealth: (): Effect.Effect<MediaServerHealth, MediaServerError> =>
      Effect.gen(function* () {
        const infoResult = yield* jellyfinJson<JellyfinSystemInfo>("/System/Info").pipe(
          Effect.map(
            (info) => ({ ok: true, info }) satisfies { ok: true; info: JellyfinSystemInfo },
          ),
          Effect.catchAll(() =>
            Effect.succeed({ ok: false, info: null } satisfies { ok: false; info: null }),
          ),
        )

        if (!infoResult.ok) {
          return {
            connected: false,
            serverName: null,
            version: null,
            libraryCount: null,
            errorMessage: "failed to connect",
          }
        }

        const foldersResult = yield* jellyfinJson<JellyfinLibraryFolders>(
          "/Library/MediaFolders",
        ).pipe(
          Effect.map(
            (folders) =>
              ({ ok: true, folders }) satisfies { ok: true; folders: JellyfinLibraryFolders },
          ),
          Effect.catchAll(() =>
            Effect.succeed({ ok: false, folders: null } satisfies { ok: false; folders: null }),
          ),
        )

        const libraryCount = foldersResult.ok
          ? foldersResult.folders.Items.filter((f) => {
              const ct = f.CollectionType
              return ct === "movies" || ct === "tvshows"
            }).length
          : null

        return {
          connected: true,
          serverName: infoResult.info.ServerName,
          version: infoResult.info.Version,
          libraryCount,
          errorMessage: null,
        }
      }),
  }
}

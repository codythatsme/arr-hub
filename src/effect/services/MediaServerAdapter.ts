import type { Effect } from "effect"

import type {
  MediaServerConnectionInfo,
  MediaServerHealth,
  MediaServerLibrary,
  ParsedGuid,
  SyncedItem,
} from "../domain/mediaServer"
import type { MediaServerError } from "../errors"

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

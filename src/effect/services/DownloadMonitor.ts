import { readdir, stat } from "node:fs/promises"
import path from "node:path"

import { SqlError } from "@effect/sql/SqlError"
import { and, eq, inArray, isNotNull, or } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { downloadQueue, mediaServers, mediaServerLibraries } from "#/db/schema"
import type {
  DownloadClientError,
  EncryptionError,
  MediaImportError,
  MediaServerError,
  NotFoundError,
  SettingsError,
  ValidationError,
} from "#/effect/errors"

import { Db } from "./Db"
import { DownloadClientService } from "./DownloadClientService"
import { MediaImportService } from "./MediaImportService"
import { MediaServerService } from "./MediaServerService"
import { SettingsService } from "./SettingsService"

// ── Types ──

export interface CompletionResult {
  readonly movieId: number | null
  readonly seriesId: number | null
  readonly episodeIds: ReadonlyArray<number>
  readonly externalId: string
}

type MonitorError =
  | NotFoundError
  | ValidationError
  | DownloadClientError
  | MediaServerError
  | EncryptionError
  | SettingsError
  | SqlError

type DbHandle = Context.Tag.Service<typeof Db>

type ImportFailure = MediaImportError | NotFoundError | SettingsError | SqlError

interface OutputReadiness {
  readonly ready: boolean
  readonly reason: string | null
}

interface OutputInspection {
  readonly newestMtimeMs: number
  readonly markerPath: string | null
}

const PROCESSING_SUFFIX_RE = /\.(?:part|partial|tmp|!qb|utpart)$/i
const PROCESSING_NAME_RE = /^(?:_unpack_|_repair_|_moving_|__admin__|\.sabnzbd)/i

function parseNonNegativeInt(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function isPostProcessingMarker(name: string): boolean {
  return PROCESSING_SUFFIX_RE.test(name) || PROCESSING_NAME_RE.test(name.toLowerCase())
}

async function inspectOutputPath(sourcePath: string): Promise<OutputInspection> {
  const sourceStats = await stat(sourcePath)
  let newestMtimeMs = sourceStats.mtimeMs
  let markerPath = isPostProcessingMarker(path.basename(sourcePath)) ? sourcePath : null

  if (!sourceStats.isDirectory()) {
    return { newestMtimeMs, markerPath }
  }

  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true })
    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dir, entry.name)
        const entryStats = await stat(entryPath)
        newestMtimeMs = Math.max(newestMtimeMs, entryStats.mtimeMs)
        if (markerPath === null && isPostProcessingMarker(entry.name)) markerPath = entryPath
        if (entry.isDirectory()) await walk(entryPath)
      }),
    )
  }

  await walk(sourcePath)
  return { newestMtimeMs, markerPath }
}

function outputReadiness(
  sourcePath: string | null,
  stabilityDelaySeconds: number,
): Effect.Effect<OutputReadiness, never> {
  if (stabilityDelaySeconds <= 0 || sourcePath === null || sourcePath.trim().length === 0) {
    return Effect.succeed({ ready: true, reason: null })
  }

  const normalizedSource = sourcePath.trim()
  return Effect.promise(async () => {
    try {
      const inspection = await inspectOutputPath(normalizedSource)
      if (inspection.markerPath !== null) {
        return {
          ready: false,
          reason: `post-processing marker still present: ${path.basename(inspection.markerPath)}`,
        }
      }

      const stableForMs = Date.now() - inspection.newestMtimeMs
      const requiredMs = stabilityDelaySeconds * 1000
      if (stableForMs < requiredMs) {
        const remainingSeconds = Math.ceil((requiredMs - stableForMs) / 1000)
        return {
          ready: false,
          reason: `download output is still stabilizing for ${remainingSeconds}s`,
        }
      }

      return { ready: true, reason: null }
    } catch {
      return { ready: true, reason: null }
    }
  })
}

function importFailureMessage(error: ImportFailure): string {
  if (error._tag === "MediaImportError") return error.message
  if (error._tag === "NotFoundError") return `${error.entity} ${error.id} was not found`
  if (error._tag === "SettingsError") return error.message
  return error instanceof Error ? error.message : String(error)
}

function markImportFailure(db: DbHandle, queueId: number, error: ImportFailure) {
  const message = importFailureMessage(error)
  return db
    .update(downloadQueue)
    .set({
      status: "failed",
      errorMessage: message,
      updatedAt: new Date(),
    })
    .where(eq(downloadQueue.id, queueId))
    .pipe(
      Effect.zipRight(
        Effect.logWarning(`download import failed for queue row ${queueId}: ${message}`),
      ),
    )
}

function markImportDeferred(db: DbHandle, queueId: number, reason: string) {
  return db
    .update(downloadQueue)
    .set({
      status: "importing",
      errorMessage: reason,
      updatedAt: new Date(),
    })
    .where(eq(downloadQueue.id, queueId))
    .pipe(
      Effect.zipRight(Effect.log(`download import deferred for queue row ${queueId}: ${reason}`)),
    )
}

// ── Service tag ──

export class DownloadMonitor extends Context.Tag("@arr-hub/DownloadMonitor")<
  DownloadMonitor,
  {
    readonly checkCompletions: () => Effect.Effect<ReadonlyArray<CompletionResult>, MonitorError>
  }
>() {}

// ── Live implementation ──

export const DownloadMonitorLive = Layer.effect(
  DownloadMonitor,
  Effect.gen(function* () {
    const db = yield* Db
    const downloadClientService = yield* DownloadClientService
    const mediaServerService = yield* MediaServerService
    const mediaImport = yield* MediaImportService
    const settings = yield* SettingsService

    return {
      checkCompletions: () =>
        Effect.gen(function* () {
          // 1. Poll all clients — upserts downloadQueue
          yield* downloadClientService.getQueue()
          const importStabilityDelaySeconds = yield* settings
            .get("media.importStabilityDelaySeconds")
            .pipe(Effect.map((setting) => parseNonNegativeInt(setting.value, 60)))

          // 2. Query completed downloads linked to either movie OR series
          const completedRows = yield* db
            .select({
              id: downloadQueue.id,
              downloadClientId: downloadQueue.downloadClientId,
              movieId: downloadQueue.movieId,
              seriesId: downloadQueue.seriesId,
              episodeIds: downloadQueue.episodeIds,
              externalId: downloadQueue.externalId,
              title: downloadQueue.title,
              outputPath: downloadQueue.outputPath,
            })
            .from(downloadQueue)
            .where(
              and(
                eq(downloadQueue.status, "completed"),
                or(isNotNull(downloadQueue.movieId), isNotNull(downloadQueue.seriesId)),
              ),
            )

          const completions: Array<CompletionResult> = []
          let touchedMovie = false
          let touchedTv = false

          for (const row of completedRows) {
            const readiness = yield* outputReadiness(row.outputPath, importStabilityDelaySeconds)
            if (!readiness.ready) {
              yield* markImportDeferred(
                db,
                row.id,
                readiness.reason ?? "download output is not ready for import",
              )
              continue
            }

            if (row.movieId !== null) {
              const imported = yield* Effect.either(
                mediaImport.importMovie({
                  movieId: row.movieId,
                  sourcePath: row.outputPath,
                  releaseTitle: row.title,
                  downloadClientId: row.downloadClientId,
                }),
              )
              if (imported._tag === "Left") {
                yield* markImportFailure(db, row.id, imported.left)
                continue
              }
              yield* db.delete(downloadQueue).where(eq(downloadQueue.id, row.id))
              completions.push({
                movieId: row.movieId,
                seriesId: null,
                episodeIds: [],
                externalId: row.externalId,
              })
              touchedMovie = true
            } else if (row.seriesId !== null && row.episodeIds && row.episodeIds.length > 0) {
              const imported = yield* Effect.either(
                mediaImport.importEpisodes({
                  seriesId: row.seriesId,
                  episodeIds: row.episodeIds,
                  sourcePath: row.outputPath,
                  releaseTitle: row.title,
                  downloadClientId: row.downloadClientId,
                }),
              )
              if (imported._tag === "Left") {
                yield* markImportFailure(db, row.id, imported.left)
                continue
              }
              yield* db.delete(downloadQueue).where(eq(downloadQueue.id, row.id))
              completions.push({
                movieId: null,
                seriesId: row.seriesId,
                episodeIds: row.episodeIds,
                externalId: row.externalId,
              })
              touchedTv = true
            }
          }

          // 3. Trigger Plex library scans
          if (touchedMovie || touchedTv) {
            const servers = yield* db
              .select()
              .from(mediaServers)
              .where(eq(mediaServers.enabled, true))

            for (const server of servers) {
              const libTypes: Array<"movie" | "show"> = []
              if (touchedMovie) libTypes.push("movie")
              if (touchedTv) libTypes.push("show")

              const libs = yield* db
                .select()
                .from(mediaServerLibraries)
                .where(
                  and(
                    eq(mediaServerLibraries.mediaServerId, server.id),
                    inArray(mediaServerLibraries.type, libTypes),
                    eq(mediaServerLibraries.enabled, true),
                  ),
                )

              for (const lib of libs) {
                yield* mediaServerService
                  .refreshLibrary(server.id, lib.externalId, "/")
                  .pipe(Effect.catchAll((e) => Effect.logWarning(`plex refresh failed: ${e._tag}`)))
              }
            }
          }

          return completions
        }),
    }
  }),
)

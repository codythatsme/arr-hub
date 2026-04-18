import { SqlError } from "@effect/sql/SqlError"
import { and, eq, inArray, isNotNull, or } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import {
  downloadQueue,
  episodes,
  movies,
  releaseDecisions,
  mediaServers,
  mediaServerLibraries,
} from "#/db/schema"
import type { MediaType } from "#/effect/domain/release"
import type {
  DownloadClientError,
  EncryptionError,
  MediaServerError,
  NotFoundError,
  ValidationError,
} from "#/effect/errors"

import { Db } from "./Db"
import { DownloadClientService } from "./DownloadClientService"
import { MediaServerService } from "./MediaServerService"

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
  | SqlError

// ── Decision lookup helper ──

type DbHandle = Context.Tag.Service<typeof Db>

function decisionFor(db: DbHandle, mediaId: number, mediaType: MediaType, candidateTitle: string) {
  return Effect.gen(function* () {
    const rows = yield* db
      .select({
        qualityRank: releaseDecisions.qualityRank,
        formatScore: releaseDecisions.formatScore,
      })
      .from(releaseDecisions)
      .where(
        and(
          eq(releaseDecisions.mediaId, mediaId),
          eq(releaseDecisions.mediaType, mediaType),
          eq(releaseDecisions.candidateTitle, candidateTitle),
        ),
      )
      .limit(1)
    return rows[0]
  })
}

function applyMovieCompletion(db: DbHandle, movieId: number, candidateTitle: string) {
  return Effect.gen(function* () {
    const decision = yield* decisionFor(db, movieId, "movie", candidateTitle)
    yield* db
      .update(movies)
      .set({
        status: "available",
        hasFile: true,
        existingQualityRank: decision?.qualityRank ?? null,
        existingFormatScore: decision?.formatScore ?? null,
      })
      .where(eq(movies.id, movieId))
  })
}

function applyEpisodeCompletion(
  db: DbHandle,
  episodeIds: ReadonlyArray<number>,
  candidateTitle: string,
) {
  return Effect.gen(function* () {
    // Decision was recorded either per-episode ("episode" mediaType, any of episodeIds)
    // or per-season ("season" mediaType). Look up by candidateTitle across both.
    const anyDecision = yield* db
      .select({
        qualityRank: releaseDecisions.qualityRank,
        formatScore: releaseDecisions.formatScore,
      })
      .from(releaseDecisions)
      .where(eq(releaseDecisions.candidateTitle, candidateTitle))
      .limit(1)
    const decision = anyDecision[0]

    for (const episodeId of episodeIds) {
      yield* db
        .update(episodes)
        .set({
          hasFile: true,
          existingQualityRank: decision?.qualityRank ?? null,
          existingFormatScore: decision?.formatScore ?? null,
          existingQualityName: null,
        })
        .where(eq(episodes.id, episodeId))
    }
  })
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

    return {
      checkCompletions: () =>
        Effect.gen(function* () {
          // 1. Poll all clients — upserts downloadQueue
          yield* downloadClientService.getQueue()

          // 2. Query completed downloads linked to either movie OR series
          const completedRows = yield* db
            .select({
              id: downloadQueue.id,
              movieId: downloadQueue.movieId,
              seriesId: downloadQueue.seriesId,
              episodeIds: downloadQueue.episodeIds,
              externalId: downloadQueue.externalId,
              title: downloadQueue.title,
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
            if (row.movieId !== null) {
              yield* applyMovieCompletion(db, row.movieId, row.title)
              yield* db.delete(downloadQueue).where(eq(downloadQueue.id, row.id))
              completions.push({
                movieId: row.movieId,
                seriesId: null,
                episodeIds: [],
                externalId: row.externalId,
              })
              touchedMovie = true
            } else if (row.seriesId !== null && row.episodeIds && row.episodeIds.length > 0) {
              yield* applyEpisodeCompletion(db, row.episodeIds, row.title)
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

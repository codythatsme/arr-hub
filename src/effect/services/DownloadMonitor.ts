import { SqlError } from "@effect/sql/SqlError"
import { and, eq, isNotNull } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import {
  downloadQueue,
  movies,
  releaseDecisions,
  mediaServers,
  mediaServerLibraries,
} from "#/db/schema"
import type {
  DownloadClientError,
  EncryptionError,
  MediaServerError,
  NotFoundError,
} from "#/effect/errors"

import { Db } from "./Db"
import { DownloadClientService } from "./DownloadClientService"
import { MediaServerService } from "./MediaServerService"

// ── Types ──

export interface CompletionResult {
  readonly movieId: number
  readonly externalId: string
}

type MonitorError =
  | NotFoundError
  | DownloadClientError
  | MediaServerError
  | EncryptionError
  | SqlError

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

          // 2. Query completed downloads linked to a movie
          const completedRows = yield* db
            .select({
              id: downloadQueue.id,
              movieId: downloadQueue.movieId,
              externalId: downloadQueue.externalId,
              title: downloadQueue.title,
            })
            .from(downloadQueue)
            .where(
              and(
                eq(downloadQueue.status, "completed"),
                isNotNull(downloadQueue.movieId),
              ),
            )

          const completions: Array<CompletionResult> = []

          for (const row of completedRows) {
            const movieId = row.movieId
            if (movieId === null) continue

            // 3. Look up release decision for quality info
            const decisionRows = yield* db
              .select({
                qualityRank: releaseDecisions.qualityRank,
                formatScore: releaseDecisions.formatScore,
                candidateTitle: releaseDecisions.candidateTitle,
              })
              .from(releaseDecisions)
              .where(
                and(
                  eq(releaseDecisions.mediaId, movieId),
                  eq(releaseDecisions.mediaType, "movie"),
                  eq(releaseDecisions.candidateTitle, row.title),
                ),
              )
              .limit(1)

            const decision = decisionRows[0]

            // 4. Update movie status
            yield* db
              .update(movies)
              .set({
                status: "available",
                hasFile: true,
                existingQualityRank: decision?.qualityRank ?? null,
                existingFormatScore: decision?.formatScore ?? null,
              })
              .where(eq(movies.id, movieId))

            // 5. Remove completed queue row
            yield* db
              .delete(downloadQueue)
              .where(eq(downloadQueue.id, row.id))

            completions.push({ movieId, externalId: row.externalId })
          }

          // 6. Trigger Plex library scan for enabled servers with movie libraries
          if (completions.length > 0) {
            const servers = yield* db
              .select()
              .from(mediaServers)
              .where(eq(mediaServers.enabled, true))

            for (const server of servers) {
              const libs = yield* db
                .select()
                .from(mediaServerLibraries)
                .where(
                  and(
                    eq(mediaServerLibraries.mediaServerId, server.id),
                    eq(mediaServerLibraries.type, "movie"),
                    eq(mediaServerLibraries.enabled, true),
                  ),
                )

              for (const lib of libs) {
                yield* mediaServerService
                  .refreshLibrary(server.id, lib.externalId, "/")
                  .pipe(
                    Effect.catchAll((e) =>
                      Effect.logWarning(`plex refresh failed: ${e._tag}`),
                    ),
                  )
              }
            }
          }

          return completions
        }),
    }
  }),
)

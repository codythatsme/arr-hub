import { SqlError } from "@effect/sql/SqlError"
import { desc, eq, inArray } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import {
  downloadClients,
  downloadQueue,
  episodes,
  movies,
  releaseBlocklist,
  releaseDecisions,
  series,
} from "#/db/schema"
import type { MediaType } from "#/effect/domain/release"

import { NotFoundError, SchedulerError } from "../errors"
import { Db } from "./Db"
import { DownloadClientService } from "./DownloadClientService"
import { recordDomainHistory } from "./OperationalHistoryService"
import { SchedulerService } from "./SchedulerService"

export type QueueStatusFilter =
  | "all"
  | "queued"
  | "downloading"
  | "importing"
  | "completed"
  | "failed"
export type QueueMediaTypeFilter = "all" | "movie" | "series" | "unlinked"

export interface QueueItem {
  readonly id: number
  readonly externalId: string
  readonly title: string
  readonly status: string
  readonly sizeBytes: number
  readonly progress: number
  readonly etaSeconds: number | null
  readonly errorMessage: string | null
  readonly outputPath: string | null
  readonly addedAt: Date
  readonly updatedAt: Date
  readonly downloadClient: {
    readonly id: number
    readonly name: string
    readonly type: string
  }
  readonly media: {
    readonly type: "movie" | "series" | "unlinked"
    readonly id: number | null
    readonly title: string
    readonly episodeIds: ReadonlyArray<number> | null
  }
}

export class QueueService extends Context.Tag("@arr-hub/QueueService")<
  QueueService,
  {
    readonly list: (filters?: {
      readonly status?: QueueStatusFilter
      readonly clientId?: number
      readonly mediaType?: QueueMediaTypeFilter
    }) => Effect.Effect<ReadonlyArray<QueueItem>, SqlError>
    readonly retry: (
      id: number,
    ) => Effect.Effect<QueueItem, NotFoundError | SchedulerError | SqlError>
    readonly remove: (
      id: number,
      options?: { readonly deleteFiles?: boolean },
    ) => Effect.Effect<void, NotFoundError | SqlError>
    readonly clearError: (id: number) => Effect.Effect<QueueItem, NotFoundError | SqlError>
    readonly blocklist: (
      id: number,
    ) => Effect.Effect<QueueItem, NotFoundError | SchedulerError | SqlError>
  }
>() {}

function historyRefs(item: QueueItem) {
  if (item.media.type === "movie" && item.media.id !== null) {
    return { mediaKind: "movie" as const, movieId: item.media.id }
  }
  if (item.media.type === "series" && item.media.id !== null) {
    return { mediaKind: "series" as const, seriesId: item.media.id }
  }
  return {}
}

export const QueueServiceLive = Layer.effect(
  QueueService,
  Effect.gen(function* () {
    const db = yield* Db
    const downloads = yield* DownloadClientService
    const scheduler = yield* SchedulerService

    const fetchItem = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select()
          .from(downloadQueue)
          .innerJoin(downloadClients, eq(downloadQueue.downloadClientId, downloadClients.id))
          .leftJoin(movies, eq(downloadQueue.movieId, movies.id))
          .leftJoin(series, eq(downloadQueue.seriesId, series.id))
          .where(eq(downloadQueue.id, id))
        const row = rows[0]
        if (!row) return yield* new NotFoundError({ entity: "queue_item", id })
        return toQueueItem(row)
      })

    const enqueueSearch = (item: QueueItem) =>
      Effect.gen(function* () {
        if (item.media.type === "movie" && item.media.id !== null) {
          yield* scheduler
            .enqueue({ _tag: "search_missing", movieId: item.media.id })
            .pipe(
              Effect.catchTag("SchedulerError", (error) =>
                error.reason === "duplicate_job" ? Effect.succeed(null) : Effect.fail(error),
              ),
            )
        }
        if (item.media.type === "series" && item.media.id !== null) {
          yield* scheduler
            .enqueue({ _tag: "tv_search_series", seriesId: item.media.id })
            .pipe(
              Effect.catchTag("SchedulerError", (error) =>
                error.reason === "duplicate_job" ? Effect.succeed(null) : Effect.fail(error),
              ),
            )
        }
      })

    const blocklistTargets = (item: QueueItem) =>
      Effect.gen(function* () {
        if (item.media.type === "movie" && item.media.id !== null) {
          return [{ mediaId: item.media.id, mediaType: "movie" as const }]
        }

        if (item.media.type !== "series" || item.media.episodeIds === null) return []
        const episodeIds = item.media.episodeIds
        if (episodeIds.length === 0) return []

        const targets: Array<{ readonly mediaId: number; readonly mediaType: MediaType }> =
          episodeIds.map((episodeId) => ({ mediaId: episodeId, mediaType: "episode" }))

        const rows = yield* db
          .select({ seasonId: episodes.seasonId })
          .from(episodes)
          .where(inArray(episodes.id, [...episodeIds]))
        const seasonIds = new Set(rows.map((row) => row.seasonId))
        if (seasonIds.size === 1) {
          const [seasonId] = seasonIds
          if (seasonId !== undefined) targets.push({ mediaId: seasonId, mediaType: "season" })
        }

        return targets
      })

    return {
      list: (filters) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(downloadQueue)
            .innerJoin(downloadClients, eq(downloadQueue.downloadClientId, downloadClients.id))
            .leftJoin(movies, eq(downloadQueue.movieId, movies.id))
            .leftJoin(series, eq(downloadQueue.seriesId, series.id))
            .orderBy(desc(downloadQueue.updatedAt))

          return rows
            .map(toQueueItem)
            .filter((item) => !filters?.clientId || item.downloadClient.id === filters.clientId)
            .filter(
              (item) =>
                !filters?.status || filters.status === "all" || item.status === filters.status,
            )
            .filter(
              (item) =>
                !filters?.mediaType ||
                filters.mediaType === "all" ||
                item.media.type === filters.mediaType,
            )
        }),

      retry: (id) =>
        Effect.gen(function* () {
          const item = yield* fetchItem(id)
          yield* db
            .update(downloadQueue)
            .set({
              status: "queued",
              progress: 0,
              errorMessage: null,
              updatedAt: new Date(),
            })
            .where(eq(downloadQueue.id, id))
          yield* enqueueSearch(item)
          return yield* fetchItem(id)
        }),

      remove: (id, options) =>
        Effect.gen(function* () {
          const item = yield* fetchItem(id)
          yield* downloads
            .removeDownload(item.downloadClient.id, item.externalId, options?.deleteFiles ?? false)
            .pipe(
              Effect.catchAll(() =>
                db.delete(downloadQueue).where(eq(downloadQueue.id, id)).pipe(Effect.asVoid),
              ),
            )
          yield* recordDomainHistory(db, {
            eventType: "deleted",
            ...historyRefs(item),
            downloadClientId: item.downloadClient.id,
            downloadClientName: item.downloadClient.name,
            downloadExternalId: item.externalId,
            releaseTitle: item.title,
            title: `Removed ${item.title}`,
            message: options?.deleteFiles
              ? "Removed queue item and requested download file deletion"
              : "Removed queue item from the download client",
            metadata: {
              queueId: item.id,
              status: item.status,
              deleteFiles: options?.deleteFiles ?? false,
              mediaTitle: item.media.title,
              episodeIds: item.media.episodeIds,
            },
          })
        }),

      clearError: (id) =>
        Effect.gen(function* () {
          yield* fetchItem(id)
          yield* db
            .update(downloadQueue)
            .set({ errorMessage: null, updatedAt: new Date() })
            .where(eq(downloadQueue.id, id))
          return yield* fetchItem(id)
        }),

      blocklist: (id) =>
        Effect.gen(function* () {
          const item = yield* fetchItem(id)
          const targets = yield* blocklistTargets(item)
          if (targets.length > 0) {
            const reason = `blocked failed queue item ${item.externalId}`
            for (const target of targets) {
              yield* db
                .insert(releaseBlocklist)
                .values({
                  mediaId: target.mediaId,
                  mediaType: target.mediaType,
                  candidateTitle: item.title,
                  externalId: item.externalId,
                  reason,
                })
                .onConflictDoNothing({
                  target: [
                    releaseBlocklist.mediaId,
                    releaseBlocklist.mediaType,
                    releaseBlocklist.candidateTitle,
                  ],
                })
            }
            yield* db.insert(releaseDecisions).values(
              targets.map((target) => ({
                mediaId: target.mediaId,
                mediaType: target.mediaType,
                candidateTitle: item.title,
                decision: "rejected" as const,
                reasons: [
                  {
                    stage: "filter" as const,
                    rule: "queue_blocklist",
                    detail: reason,
                  },
                ],
              })),
            )
            yield* recordDomainHistory(db, {
              eventType: "blocklisted",
              ...historyRefs(item),
              downloadClientId: item.downloadClient.id,
              downloadClientName: item.downloadClient.name,
              downloadExternalId: item.externalId,
              releaseTitle: item.title,
              title: `Blocklisted ${item.title}`,
              message: reason,
              metadata: {
                queueId: item.id,
                targets,
                mediaTitle: item.media.title,
                episodeIds: item.media.episodeIds,
              },
            })
          }
          if (item.media.id !== null && item.media.type !== "unlinked") {
            yield* enqueueSearch(item)
          }
          yield* db
            .update(downloadQueue)
            .set({
              status: "failed",
              errorMessage: "Blocklisted and queued for alternative search",
              updatedAt: new Date(),
            })
            .where(eq(downloadQueue.id, id))
          return yield* fetchItem(id)
        }),
    }
  }),
)

function toQueueItem(row: {
  readonly download_queue: typeof downloadQueue.$inferSelect
  readonly download_clients: typeof downloadClients.$inferSelect
  readonly movies: typeof movies.$inferSelect | null
  readonly series: typeof series.$inferSelect | null
}): QueueItem {
  const media =
    row.movies !== null
      ? {
          type: "movie" as const,
          id: row.movies.id,
          title: row.movies.title,
          episodeIds: null,
        }
      : row.series !== null
        ? {
            type: "series" as const,
            id: row.series.id,
            title: row.series.title,
            episodeIds: row.download_queue.episodeIds,
          }
        : {
            type: "unlinked" as const,
            id: null,
            title: "Unlinked",
            episodeIds: null,
          }

  return {
    id: row.download_queue.id,
    externalId: row.download_queue.externalId,
    title: row.download_queue.title,
    status: row.download_queue.status,
    sizeBytes: row.download_queue.sizeBytes,
    progress: row.download_queue.progress,
    etaSeconds: row.download_queue.etaSeconds,
    errorMessage: row.download_queue.errorMessage,
    outputPath: row.download_queue.outputPath,
    addedAt: row.download_queue.addedAt,
    updatedAt: row.download_queue.updatedAt,
    downloadClient: {
      id: row.download_clients.id,
      name: row.download_clients.name,
      type: row.download_clients.type,
    },
    media,
  }
}

import { SqlError } from "@effect/sql/SqlError"
import { and, between, desc, eq, gte, lt, lte, type SQL } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import {
  downloadHistory,
  type DownloadHistoryMediaKind,
  type DownloadHistoryStatus,
} from "#/db/schema"

import { Db } from "./Db"

export type DownloadHistoryRow = typeof downloadHistory.$inferSelect

export interface DownloadHistoryInput {
  readonly queueId?: number | null
  readonly downloadClientId?: number | null
  readonly downloadClientName?: string | null
  readonly mediaKind?: DownloadHistoryMediaKind | null
  readonly movieId?: number | null
  readonly seriesId?: number | null
  readonly episodeIds?: ReadonlyArray<number> | null
  readonly mediaTitle?: string | null
  readonly externalId: string
  readonly title: string
  readonly status: DownloadHistoryStatus
  readonly sizeBytes?: number
  readonly progress?: number
  readonly errorMessage?: string | null
  readonly outputPath?: string | null
  readonly metadata?: Record<string, unknown>
  readonly recordedAt?: Date
}

export interface ListDownloadHistoryFilters {
  readonly status?: DownloadHistoryStatus
  readonly mediaKind?: DownloadHistoryMediaKind
  readonly movieId?: number
  readonly seriesId?: number
  readonly downloadClientId?: number
  readonly start?: Date
  readonly end?: Date
}

export interface ListDownloadHistoryQuery {
  readonly filters?: ListDownloadHistoryFilters
  readonly cursor?: number | null
  readonly limit?: number
}

export interface ListDownloadHistoryResult {
  readonly items: ReadonlyArray<DownloadHistoryRow>
  readonly nextCursor: number | null
}

type DbHandle = Context.Tag.Service<typeof Db>

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export function recordDownloadHistory(
  db: DbHandle,
  input: DownloadHistoryInput,
): Effect.Effect<DownloadHistoryRow, SqlError> {
  return Effect.gen(function* () {
    const rows = yield* db
      .insert(downloadHistory)
      .values({
        queueId: input.queueId ?? null,
        downloadClientId: input.downloadClientId ?? null,
        downloadClientName: input.downloadClientName ?? null,
        mediaKind: input.mediaKind ?? null,
        movieId: input.movieId ?? null,
        seriesId: input.seriesId ?? null,
        episodeIds: input.episodeIds ?? null,
        mediaTitle: input.mediaTitle ?? null,
        externalId: input.externalId,
        title: input.title,
        status: input.status,
        sizeBytes: input.sizeBytes ?? 0,
        progress: input.progress ?? 0,
        errorMessage: input.errorMessage ?? null,
        outputPath: input.outputPath ?? null,
        metadata: input.metadata ?? {},
        recordedAt: input.recordedAt ?? new Date(),
      })
      .returning()
    return rows[0]
  })
}

export class DownloadHistoryService extends Context.Tag("@arr-hub/DownloadHistoryService")<
  DownloadHistoryService,
  {
    readonly record: (input: DownloadHistoryInput) => Effect.Effect<DownloadHistoryRow, SqlError>
    readonly list: (
      query?: ListDownloadHistoryQuery,
    ) => Effect.Effect<ListDownloadHistoryResult, SqlError>
  }
>() {}

export const DownloadHistoryServiceLive = Layer.effect(
  DownloadHistoryService,
  Effect.gen(function* () {
    const db = yield* Db

    return {
      record: (input) => recordDownloadHistory(db, input),

      list: (query) =>
        Effect.gen(function* () {
          const limit = Math.min(MAX_LIMIT, Math.max(1, query?.limit ?? DEFAULT_LIMIT))
          const conditions: Array<SQL> = []
          const filters = query?.filters

          if (filters?.status) conditions.push(eq(downloadHistory.status, filters.status))
          if (filters?.mediaKind) conditions.push(eq(downloadHistory.mediaKind, filters.mediaKind))
          if (filters?.movieId !== undefined)
            conditions.push(eq(downloadHistory.movieId, filters.movieId))
          if (filters?.seriesId !== undefined)
            conditions.push(eq(downloadHistory.seriesId, filters.seriesId))
          if (filters?.downloadClientId !== undefined)
            conditions.push(eq(downloadHistory.downloadClientId, filters.downloadClientId))
          if (filters?.start && filters?.end)
            conditions.push(between(downloadHistory.recordedAt, filters.start, filters.end))
          else if (filters?.start) conditions.push(gte(downloadHistory.recordedAt, filters.start))
          else if (filters?.end) conditions.push(lte(downloadHistory.recordedAt, filters.end))

          if (query?.cursor !== undefined && query.cursor !== null)
            conditions.push(lt(downloadHistory.id, query.cursor))

          const where = conditions.length > 0 ? and(...conditions) : undefined
          const rows = yield* db
            .select()
            .from(downloadHistory)
            .where(where)
            .orderBy(desc(downloadHistory.id))
            .limit(limit + 1)

          const hasMore = rows.length > limit
          const items = hasMore ? rows.slice(0, limit) : rows
          const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null

          return { items, nextCursor }
        }),
    }
  }),
)

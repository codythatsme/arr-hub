import { SqlError } from "@effect/sql/SqlError"
import { and, between, desc, eq, gte, lt, lte, type SQL } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import {
  domainHistory,
  type DomainHistoryEventType,
  type DomainHistoryMediaKind,
} from "#/db/schema"

import { Db } from "./Db"

export type DomainHistoryRow = typeof domainHistory.$inferSelect

export interface DomainHistoryInput {
  readonly eventType: DomainHistoryEventType
  readonly mediaKind?: DomainHistoryMediaKind | null
  readonly movieId?: number | null
  readonly seriesId?: number | null
  readonly seasonId?: number | null
  readonly episodeId?: number | null
  readonly releaseDecisionId?: number | null
  readonly releaseTitle?: string | null
  readonly indexerId?: number | null
  readonly indexerName?: string | null
  readonly downloadClientId?: number | null
  readonly downloadClientName?: string | null
  readonly downloadExternalId?: string | null
  readonly schedulerJobId?: number | null
  readonly notificationDeliveryId?: number | null
  readonly title: string
  readonly message: string
  readonly metadata?: Record<string, unknown>
  readonly createdAt?: Date
}

export interface ListDomainHistoryFilters {
  readonly eventType?: DomainHistoryEventType
  readonly mediaKind?: DomainHistoryMediaKind
  readonly movieId?: number
  readonly seriesId?: number
  readonly seasonId?: number
  readonly episodeId?: number
  readonly indexerId?: number
  readonly downloadClientId?: number
  readonly start?: Date
  readonly end?: Date
}

export interface ListDomainHistoryQuery {
  readonly filters?: ListDomainHistoryFilters
  readonly cursor?: number | null
  readonly limit?: number
}

export interface ListDomainHistoryResult {
  readonly items: ReadonlyArray<DomainHistoryRow>
  readonly nextCursor: number | null
}

type DbHandle = Context.Tag.Service<typeof Db>

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export function recordDomainHistory(
  db: DbHandle,
  input: DomainHistoryInput,
): Effect.Effect<DomainHistoryRow, SqlError> {
  return Effect.gen(function* () {
    const rows = yield* db
      .insert(domainHistory)
      .values({
        eventType: input.eventType,
        mediaKind: input.mediaKind ?? null,
        movieId: input.movieId ?? null,
        seriesId: input.seriesId ?? null,
        seasonId: input.seasonId ?? null,
        episodeId: input.episodeId ?? null,
        releaseDecisionId: input.releaseDecisionId ?? null,
        releaseTitle: input.releaseTitle ?? null,
        indexerId: input.indexerId ?? null,
        indexerName: input.indexerName ?? null,
        downloadClientId: input.downloadClientId ?? null,
        downloadClientName: input.downloadClientName ?? null,
        downloadExternalId: input.downloadExternalId ?? null,
        schedulerJobId: input.schedulerJobId ?? null,
        notificationDeliveryId: input.notificationDeliveryId ?? null,
        title: input.title,
        message: input.message,
        metadata: input.metadata ?? {},
        createdAt: input.createdAt ?? new Date(),
      })
      .returning()
    return rows[0]
  })
}

export class OperationalHistoryService extends Context.Tag("@arr-hub/OperationalHistoryService")<
  OperationalHistoryService,
  {
    readonly record: (input: DomainHistoryInput) => Effect.Effect<DomainHistoryRow, SqlError>
    readonly list: (
      query?: ListDomainHistoryQuery,
    ) => Effect.Effect<ListDomainHistoryResult, SqlError>
  }
>() {}

export const OperationalHistoryServiceLive = Layer.effect(
  OperationalHistoryService,
  Effect.gen(function* () {
    const db = yield* Db

    return {
      record: (input) => recordDomainHistory(db, input),

      list: (query) =>
        Effect.gen(function* () {
          const limit = Math.min(MAX_LIMIT, Math.max(1, query?.limit ?? DEFAULT_LIMIT))
          const conditions: Array<SQL> = []
          const filters = query?.filters

          if (filters?.eventType) conditions.push(eq(domainHistory.eventType, filters.eventType))
          if (filters?.mediaKind) conditions.push(eq(domainHistory.mediaKind, filters.mediaKind))
          if (filters?.movieId !== undefined)
            conditions.push(eq(domainHistory.movieId, filters.movieId))
          if (filters?.seriesId !== undefined)
            conditions.push(eq(domainHistory.seriesId, filters.seriesId))
          if (filters?.seasonId !== undefined)
            conditions.push(eq(domainHistory.seasonId, filters.seasonId))
          if (filters?.episodeId !== undefined)
            conditions.push(eq(domainHistory.episodeId, filters.episodeId))
          if (filters?.indexerId !== undefined)
            conditions.push(eq(domainHistory.indexerId, filters.indexerId))
          if (filters?.downloadClientId !== undefined)
            conditions.push(eq(domainHistory.downloadClientId, filters.downloadClientId))
          if (filters?.start && filters?.end)
            conditions.push(between(domainHistory.createdAt, filters.start, filters.end))
          else if (filters?.start) conditions.push(gte(domainHistory.createdAt, filters.start))
          else if (filters?.end) conditions.push(lte(domainHistory.createdAt, filters.end))

          if (query?.cursor !== undefined && query.cursor !== null)
            conditions.push(lt(domainHistory.id, query.cursor))

          const where = conditions.length > 0 ? and(...conditions) : undefined
          const rows = yield* db
            .select()
            .from(domainHistory)
            .where(where)
            .orderBy(desc(domainHistory.id))
            .limit(limit + 1)

          const hasMore = rows.length > limit
          const items = hasMore ? rows.slice(0, limit) : rows
          const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null

          return { items, nextCursor }
        }),
    }
  }),
)

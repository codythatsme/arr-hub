import { SqlError } from "@effect/sql/SqlError"
import { and, between, count, desc, eq, sql, type SQL } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { sessionHistory } from "#/db/schema"

import type { SessionMediaType, TranscodeDecision } from "../domain/mediaServer"
import { Db } from "./Db"

// ── Types ──

export interface StatsRange {
  readonly start: Date
  readonly end: Date
}

export interface StatsFilters {
  readonly userId?: string
  readonly mediaType?: SessionMediaType
  readonly mediaServerId?: number
}

export interface PlaysByDayBucket {
  readonly date: string
  readonly movies: number
  readonly episodes: number
  readonly total: number
}

export interface WatchTimeByDayBucket {
  readonly date: string
  readonly seconds: number
}

export type TopMediaSort = "plays" | "duration"

export interface TopMediaEntry {
  readonly mediaType: SessionMediaType
  readonly title: string
  readonly playCount: number
  readonly totalWatchedSec: number
}

export interface TopUserEntry {
  readonly plexUserId: string
  readonly plexUsername: string
  readonly playCount: number
  readonly totalWatchedSec: number
}

export interface StreamTypeDistribution {
  readonly directPlay: number
  readonly directStream: number
  readonly transcode: number
  readonly total: number
}

export interface PlaysByHourBucket {
  readonly hour: number
  readonly playCount: number
}

const DEFAULT_TOP_LIMIT = 10
const MAX_TOP_LIMIT = 100

// ── Service tag ──

export class StatsService extends Context.Tag("@arr-hub/StatsService")<
  StatsService,
  {
    readonly getPlaysByDay: (
      range: StatsRange,
      filters?: StatsFilters,
    ) => Effect.Effect<ReadonlyArray<PlaysByDayBucket>, SqlError>
    readonly getWatchTimeByDay: (
      range: StatsRange,
      filters?: StatsFilters,
    ) => Effect.Effect<ReadonlyArray<WatchTimeByDayBucket>, SqlError>
    readonly getTopMedia: (args: {
      readonly range: StatsRange
      readonly mediaType?: SessionMediaType
      readonly limit?: number
      readonly sort?: TopMediaSort
      readonly userId?: string
      readonly mediaServerId?: number
    }) => Effect.Effect<ReadonlyArray<TopMediaEntry>, SqlError>
    readonly getTopUsers: (args: {
      readonly range: StatsRange
      readonly limit?: number
      readonly mediaServerId?: number
      readonly mediaType?: SessionMediaType
    }) => Effect.Effect<ReadonlyArray<TopUserEntry>, SqlError>
    readonly getStreamTypeDistribution: (
      range: StatsRange,
      filters?: StatsFilters,
    ) => Effect.Effect<StreamTypeDistribution, SqlError>
    readonly getPlaysByHourOfDay: (
      range: StatsRange,
      filters?: StatsFilters,
    ) => Effect.Effect<ReadonlyArray<PlaysByHourBucket>, SqlError>
  }
>() {}

// ── Helpers ──

const buildFilterConditions = (range: StatsRange, filters?: StatsFilters): Array<SQL> => {
  const conditions: Array<SQL> = [between(sessionHistory.stoppedAt, range.start, range.end)]
  if (filters?.userId) conditions.push(eq(sessionHistory.plexUserId, filters.userId))
  if (filters?.mediaType) conditions.push(eq(sessionHistory.mediaType, filters.mediaType))
  if (filters?.mediaServerId !== undefined)
    conditions.push(eq(sessionHistory.mediaServerId, filters.mediaServerId))
  return conditions
}

const dayBucket = sql<string>`strftime('%Y-%m-%d', ${sessionHistory.stoppedAt}, 'unixepoch')`
const hourBucket = sql<number>`CAST(strftime('%H', ${sessionHistory.stoppedAt}, 'unixepoch') AS INTEGER)`
const watchedMs = sql<number>`COALESCE(SUM(${sessionHistory.viewOffset}), 0)`
const moviePlays = sql<number>`SUM(CASE WHEN ${sessionHistory.mediaType} = 'movie' THEN 1 ELSE 0 END)`
const episodePlays = sql<number>`SUM(CASE WHEN ${sessionHistory.mediaType} = 'episode' THEN 1 ELSE 0 END)`

const decisionCount = (decision: TranscodeDecision) =>
  sql<number>`SUM(CASE WHEN ${sessionHistory.transcodeDecision} = ${decision} THEN 1 ELSE 0 END)`

const clampLimit = (n: number | undefined): number =>
  Math.min(MAX_TOP_LIMIT, Math.max(1, Math.floor(n ?? DEFAULT_TOP_LIMIT)))

// ── Live ──

export const StatsServiceLive = Layer.effect(
  StatsService,
  Effect.gen(function* () {
    const db = yield* Db

    return {
      getPlaysByDay: (range, filters) =>
        Effect.gen(function* () {
          const where = and(...buildFilterConditions(range, filters))
          const rows = yield* db
            .select({
              date: dayBucket,
              movies: moviePlays,
              episodes: episodePlays,
              total: count(),
            })
            .from(sessionHistory)
            .where(where)
            .groupBy(dayBucket)
            .orderBy(dayBucket)

          return rows.map((r) => ({
            date: r.date,
            movies: Number(r.movies ?? 0),
            episodes: Number(r.episodes ?? 0),
            total: r.total,
          }))
        }),

      getWatchTimeByDay: (range, filters) =>
        Effect.gen(function* () {
          const where = and(...buildFilterConditions(range, filters))
          const rows = yield* db
            .select({
              date: dayBucket,
              watchedMs,
            })
            .from(sessionHistory)
            .where(where)
            .groupBy(dayBucket)
            .orderBy(dayBucket)

          return rows.map((r) => ({
            date: r.date,
            seconds: Math.round(Number(r.watchedMs ?? 0) / 1000),
          }))
        }),

      getTopMedia: ({ range, mediaType, limit, sort, userId, mediaServerId }) =>
        Effect.gen(function* () {
          const where = and(...buildFilterConditions(range, { mediaType, userId, mediaServerId }))
          const titleExpr = sql<string>`COALESCE(${sessionHistory.grandparentTitle}, ${sessionHistory.title})`
          const orderExpr = sort === "duration" ? watchedMs : count()
          const rows = yield* db
            .select({
              mediaType: sessionHistory.mediaType,
              title: titleExpr,
              playCount: count(),
              watchedMs,
            })
            .from(sessionHistory)
            .where(where)
            .groupBy(sessionHistory.mediaType, titleExpr)
            .orderBy(desc(orderExpr))
            .limit(clampLimit(limit))

          return rows.map((r) => ({
            mediaType: r.mediaType,
            title: r.title,
            playCount: r.playCount,
            totalWatchedSec: Math.round(Number(r.watchedMs ?? 0) / 1000),
          }))
        }),

      getTopUsers: ({ range, limit, mediaServerId, mediaType }) =>
        Effect.gen(function* () {
          const where = and(...buildFilterConditions(range, { mediaServerId, mediaType }))
          const rows = yield* db
            .select({
              plexUserId: sessionHistory.plexUserId,
              plexUsername: sessionHistory.plexUsername,
              playCount: count(),
              watchedMs,
            })
            .from(sessionHistory)
            .where(where)
            .groupBy(sessionHistory.plexUserId, sessionHistory.plexUsername)
            .orderBy(desc(count()))
            .limit(clampLimit(limit))

          return rows.map((r) => ({
            plexUserId: r.plexUserId,
            plexUsername: r.plexUsername,
            playCount: r.playCount,
            totalWatchedSec: Math.round(Number(r.watchedMs ?? 0) / 1000),
          }))
        }),

      getStreamTypeDistribution: (range, filters) =>
        Effect.gen(function* () {
          const where = and(...buildFilterConditions(range, filters))
          const rows = yield* db
            .select({
              directPlay: decisionCount("direct_play"),
              directStream: decisionCount("direct_stream"),
              transcode: decisionCount("transcode"),
              total: count(),
            })
            .from(sessionHistory)
            .where(where)

          const r = rows[0]
          return {
            directPlay: Number(r?.directPlay ?? 0),
            directStream: Number(r?.directStream ?? 0),
            transcode: Number(r?.transcode ?? 0),
            total: r?.total ?? 0,
          }
        }),

      getPlaysByHourOfDay: (range, filters) =>
        Effect.gen(function* () {
          const where = and(...buildFilterConditions(range, filters))
          const rows = yield* db
            .select({
              hour: hourBucket,
              playCount: count(),
            })
            .from(sessionHistory)
            .where(where)
            .groupBy(hourBucket)
            .orderBy(hourBucket)

          const map = new Map<number, number>()
          for (const r of rows) map.set(Number(r.hour), r.playCount)
          return Array.from({ length: 24 }, (_, h) => ({ hour: h, playCount: map.get(h) ?? 0 }))
        }),
    }
  }),
)

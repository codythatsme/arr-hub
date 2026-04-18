import { SqlError } from "@effect/sql/SqlError"
import { and, between, desc, eq, lt, type SQL } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { episodes, movies, sessionHistory } from "#/db/schema"

import type { MediaServerSession, SessionMediaType } from "../domain/mediaServer"
import { Db } from "./Db"

// ── Types ──

export type SessionHistoryRow = typeof sessionHistory.$inferSelect

export interface ListHistoryFilters {
  readonly userId?: string
  readonly mediaType?: SessionMediaType
  readonly mediaServerId?: number
  readonly start?: Date
  readonly end?: Date
}

export interface ListHistoryQuery {
  readonly filters?: ListHistoryFilters
  readonly cursor?: number | null
  readonly limit?: number
}

export interface ListHistoryResult {
  readonly items: ReadonlyArray<SessionHistoryRow>
  readonly nextCursor: number | null
}

export type MediaRef =
  | { readonly kind: "movie"; readonly movieId: number }
  | { readonly kind: "episode"; readonly episodeId: number }

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

// ── Service ──

export class SessionHistoryService extends Context.Tag("@arr-hub/SessionHistoryService")<
  SessionHistoryService,
  {
    /** Persist stopped sessions. Each row is FK-linked to a movie/episode when GUIDs match. */
    readonly writeHistory: (
      sessions: ReadonlyArray<MediaServerSession>,
    ) => Effect.Effect<ReadonlyArray<SessionHistoryRow>, SqlError>
    readonly listHistory: (query?: ListHistoryQuery) => Effect.Effect<ListHistoryResult, SqlError>
    readonly getHistoryForMedia: (
      ref: MediaRef,
    ) => Effect.Effect<ReadonlyArray<SessionHistoryRow>, SqlError>
  }
>() {}

// ── Helpers ──

/** Below this watched fraction we drop the row — likely a quick scrub or accidental open. */
const MIN_WATCHED_FRACTION = 0.01

function shouldRecord(session: MediaServerSession): boolean {
  if (session.duration <= 0) return false
  return session.viewOffset / session.duration >= MIN_WATCHED_FRACTION
}

// ── Live ──

export const SessionHistoryServiceLive = Layer.effect(
  SessionHistoryService,
  Effect.gen(function* () {
    const db = yield* Db

    const resolveMovieId = (tmdbId: number | null): Effect.Effect<number | null, SqlError> =>
      tmdbId === null
        ? Effect.succeed(null)
        : Effect.gen(function* () {
            const rows = yield* db
              .select({ id: movies.id })
              .from(movies)
              .where(eq(movies.tmdbId, tmdbId))
            return rows[0]?.id ?? null
          })

    const resolveEpisodeId = (tvdbId: number | null): Effect.Effect<number | null, SqlError> =>
      tvdbId === null
        ? Effect.succeed(null)
        : Effect.gen(function* () {
            const rows = yield* db
              .select({ id: episodes.id })
              .from(episodes)
              .where(eq(episodes.tvdbId, tvdbId))
            return rows[0]?.id ?? null
          })

    return {
      writeHistory: (sessions) =>
        Effect.gen(function* () {
          const out: Array<SessionHistoryRow> = []
          const stoppedAt = new Date()

          for (const s of sessions) {
            if (!shouldRecord(s)) continue

            const movieId = s.mediaType === "movie" ? yield* resolveMovieId(s.tmdbId) : null
            const episodeId = s.mediaType === "episode" ? yield* resolveEpisodeId(s.tvdbId) : null

            const [row] = yield* db
              .insert(sessionHistory)
              .values({
                mediaServerId: s.mediaServerId,
                plexUserId: s.userId,
                plexUsername: s.username,
                ratingKey: s.ratingKey,
                mediaType: s.mediaType,
                title: s.title,
                parentTitle: s.parentTitle,
                grandparentTitle: s.grandparentTitle,
                year: s.year,
                thumb: s.thumb,
                startedAt: s.startedAt,
                stoppedAt,
                duration: s.duration,
                viewOffset: s.viewOffset,
                pausedDurationSec: 0,
                transcodeDecision: s.transcodeDecision,
                videoResolution: s.videoResolution,
                audioCodec: s.audioCodec,
                player: s.player,
                platform: s.platform,
                product: s.product,
                ipAddress: s.ipAddress,
                bandwidth: s.bandwidth,
                isLocal: s.isLocal,
                movieId,
                episodeId,
              })
              .returning()
            out.push(row)
          }

          return out
        }),

      listHistory: (query) =>
        Effect.gen(function* () {
          const limit = Math.min(MAX_LIMIT, Math.max(1, query?.limit ?? DEFAULT_LIMIT))
          const conditions: Array<SQL> = []
          const filters = query?.filters

          if (filters?.userId) conditions.push(eq(sessionHistory.plexUserId, filters.userId))
          if (filters?.mediaType) conditions.push(eq(sessionHistory.mediaType, filters.mediaType))
          if (filters?.mediaServerId !== undefined)
            conditions.push(eq(sessionHistory.mediaServerId, filters.mediaServerId))
          if (filters?.start && filters?.end)
            conditions.push(between(sessionHistory.stoppedAt, filters.start, filters.end))

          if (query?.cursor !== undefined && query.cursor !== null)
            conditions.push(lt(sessionHistory.id, query.cursor))

          const where = conditions.length > 0 ? and(...conditions) : undefined

          const rows = yield* db
            .select()
            .from(sessionHistory)
            .where(where)
            .orderBy(desc(sessionHistory.id))
            .limit(limit + 1)

          const hasMore = rows.length > limit
          const items = hasMore ? rows.slice(0, limit) : rows
          const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null

          return { items, nextCursor }
        }),

      getHistoryForMedia: (ref) =>
        Effect.gen(function* () {
          const where =
            ref.kind === "movie"
              ? eq(sessionHistory.movieId, ref.movieId)
              : eq(sessionHistory.episodeId, ref.episodeId)

          return yield* db
            .select()
            .from(sessionHistory)
            .where(where)
            .orderBy(desc(sessionHistory.stoppedAt))
        }),
    }
  }),
)

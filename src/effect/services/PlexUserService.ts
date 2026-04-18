import { SqlError } from "@effect/sql/SqlError"
import { and, count, desc, eq, max, notInArray, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { mediaServers, plexUsers, sessionHistory } from "#/db/schema"

import type { SessionMediaType } from "../domain/mediaServer"
import {
  MediaServerError,
  NotFoundError,
  type EncryptionError,
  type ValidationError,
} from "../errors"
import { AdapterRegistry } from "./AdapterRegistry"
import { CryptoService } from "./CryptoService"
import { Db } from "./Db"

// ── Types ──

export type PlexUserRow = typeof plexUsers.$inferSelect

export interface PlexUserSyncResult {
  readonly added: number
  readonly updated: number
  readonly deactivated: number
}

export interface TopMediaEntry {
  readonly mediaType: SessionMediaType
  readonly title: string
  readonly playCount: number
  readonly totalWatchedSec: number
}

export interface PlexUserStats {
  readonly totalPlayCount: number
  readonly totalWatchTimeSec: number
  readonly lastSeenAt: Date | null
  readonly topMedia: ReadonlyArray<TopMediaEntry>
}

// ── Service tag ──

export class PlexUserService extends Context.Tag("@arr-hub/PlexUserService")<
  PlexUserService,
  {
    readonly syncUsers: (
      serverId: number,
    ) => Effect.Effect<
      PlexUserSyncResult,
      NotFoundError | MediaServerError | ValidationError | EncryptionError | SqlError
    >
    readonly listUsers: (serverId: number) => Effect.Effect<ReadonlyArray<PlexUserRow>, SqlError>
    readonly getUserStats: (args: {
      readonly serverId: number
      readonly plexUserId: string
    }) => Effect.Effect<PlexUserStats, SqlError>
    /** Bump cached counters + lastSeenAt for a recorded watch. No-op if user row missing. */
    readonly recordWatch: (args: {
      readonly mediaServerId: number
      readonly plexUserId: string
      readonly watchedSec: number
      readonly stoppedAt: Date
    }) => Effect.Effect<void, SqlError>
  }
>() {}

// ── Live implementation ──

const TOP_MEDIA_LIMIT = 5

export const PlexUserServiceLive = Layer.effect(
  PlexUserService,
  Effect.gen(function* () {
    const db = yield* Db
    const crypto = yield* CryptoService
    const registry = yield* AdapterRegistry

    const loadAdapter = (serverId: number) =>
      Effect.gen(function* () {
        const rows = yield* db.select().from(mediaServers).where(eq(mediaServers.id, serverId))
        const server = rows[0]
        if (!server) return yield* new NotFoundError({ entity: "media_server", id: serverId })
        const token = yield* crypto.decrypt(server.tokenEncrypted)
        const factory = yield* registry.getMediaServerFactory(server.type)
        return factory({
          id: server.id,
          name: server.name,
          type: server.type,
          host: server.host,
          port: server.port,
          token,
          useSsl: server.useSsl,
          settings: server.settings,
        })
      })

    return {
      syncUsers: (serverId) =>
        Effect.gen(function* () {
          const adapter = yield* loadAdapter(serverId)
          const users = yield* adapter.getSharedUsers()
          const now = new Date()

          const existingRows = yield* db
            .select({ plexUserId: plexUsers.plexUserId })
            .from(plexUsers)
            .where(eq(plexUsers.mediaServerId, serverId))
          const existingIds = new Set(existingRows.map((r) => r.plexUserId))

          let added = 0
          let updated = 0
          const seenIds: Array<string> = []

          for (const u of users) {
            seenIds.push(u.plexUserId)
            yield* db
              .insert(plexUsers)
              .values({
                mediaServerId: serverId,
                plexUserId: u.plexUserId,
                username: u.username,
                friendlyName: u.friendlyName,
                email: u.email,
                thumb: u.thumb,
                isAdmin: u.isAdmin,
                isActive: true,
                syncedAt: now,
              })
              .onConflictDoUpdate({
                target: [plexUsers.mediaServerId, plexUsers.plexUserId],
                set: {
                  username: u.username,
                  friendlyName: u.friendlyName,
                  email: u.email,
                  thumb: u.thumb,
                  isAdmin: u.isAdmin,
                  isActive: true,
                  syncedAt: now,
                },
              })

            if (existingIds.has(u.plexUserId)) updated++
            else added++
          }

          // Mark users missing from the latest sync as inactive.
          const notSeen =
            seenIds.length === 0 ? undefined : notInArray(plexUsers.plexUserId, seenIds)
          const deactivated = yield* db
            .update(plexUsers)
            .set({ isActive: false })
            .where(
              and(
                eq(plexUsers.mediaServerId, serverId),
                eq(plexUsers.isActive, true),
                ...(notSeen ? [notSeen] : []),
              ),
            )
            .returning({ id: plexUsers.id })

          return { added, updated, deactivated: deactivated.length }
        }),

      listUsers: (serverId) =>
        db
          .select()
          .from(plexUsers)
          .where(eq(plexUsers.mediaServerId, serverId))
          .orderBy(desc(plexUsers.isActive), desc(plexUsers.isAdmin), plexUsers.friendlyName),

      getUserStats: ({ serverId, plexUserId }) =>
        Effect.gen(function* () {
          const watchedExpr = sql<number>`SUM(${sessionHistory.viewOffset})`
          const aggregateRows = yield* db
            .select({
              totalPlayCount: count(),
              totalWatchedMs: watchedExpr,
              lastSeenAt: max(sessionHistory.stoppedAt),
            })
            .from(sessionHistory)
            .where(
              and(
                eq(sessionHistory.mediaServerId, serverId),
                eq(sessionHistory.plexUserId, plexUserId),
              ),
            )

          const agg = aggregateRows[0]
          const totalWatchedMs = Number(agg?.totalWatchedMs ?? 0)
          const lastSeenRaw = agg?.lastSeenAt ?? null

          const topRows = yield* db
            .select({
              mediaType: sessionHistory.mediaType,
              title: sql<string>`COALESCE(${sessionHistory.grandparentTitle}, ${sessionHistory.title})`,
              playCount: count(),
              totalWatchedMs: watchedExpr,
            })
            .from(sessionHistory)
            .where(
              and(
                eq(sessionHistory.mediaServerId, serverId),
                eq(sessionHistory.plexUserId, plexUserId),
              ),
            )
            .groupBy(
              sessionHistory.mediaType,
              sql`COALESCE(${sessionHistory.grandparentTitle}, ${sessionHistory.title})`,
            )
            .orderBy(desc(count()))
            .limit(TOP_MEDIA_LIMIT)

          return {
            totalPlayCount: agg?.totalPlayCount ?? 0,
            totalWatchTimeSec: Math.round(totalWatchedMs / 1000),
            lastSeenAt: lastSeenRaw ? new Date(lastSeenRaw) : null,
            topMedia: topRows.map((r) => ({
              mediaType: r.mediaType,
              title: r.title,
              playCount: r.playCount,
              totalWatchedSec: Math.round(Number(r.totalWatchedMs ?? 0) / 1000),
            })),
          }
        }),

      recordWatch: ({ mediaServerId, plexUserId, watchedSec, stoppedAt }) =>
        Effect.gen(function* () {
          yield* db
            .update(plexUsers)
            .set({
              lastSeenAt: stoppedAt,
              totalPlayCount: sql`${plexUsers.totalPlayCount} + 1`,
              totalWatchTimeSec: sql`${plexUsers.totalWatchTimeSec} + ${watchedSec}`,
            })
            .where(
              and(eq(plexUsers.mediaServerId, mediaServerId), eq(plexUsers.plexUserId, plexUserId)),
            )
        }),
    }
  }),
)

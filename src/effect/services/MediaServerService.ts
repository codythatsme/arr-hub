import { SqlError } from "@effect/sql/SqlError"
import { and, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import {
  mediaServers,
  mediaServerHealth,
  mediaServerLibraries,
  movies,
  series,
  seasons,
  episodes,
} from "#/db/schema"

import type {
  MediaServerAdapterMetadata,
  MediaServerConfig,
  MediaServerHealthStatus,
  MediaServerLibraryType,
  MediaServerLibraryWithSync,
  MediaServerSettings,
  MediaServerType,
  MediaServerWithHealth,
  SyncResult,
} from "../domain/mediaServer"
import {
  MediaServerError,
  NotFoundError,
  type EncryptionError,
  type ValidationError,
} from "../errors"
import { AdapterRegistry } from "./AdapterRegistry"
import { CryptoService } from "./CryptoService"
import { Db } from "./Db"

// ── Input types ──

interface MediaServerInput {
  readonly name: string
  readonly type: MediaServerType
  readonly host: string
  readonly port: number
  readonly token: string
  readonly useSsl?: boolean
  readonly enabled?: boolean
  readonly settings?: MediaServerSettings
}

interface MediaServerUpdate {
  readonly name?: string
  readonly type?: MediaServerType
  readonly host?: string
  readonly port?: number
  readonly token?: string
  readonly useSsl?: boolean
  readonly enabled?: boolean
  readonly settings?: MediaServerSettings
}

// ── Service tag ──

export class MediaServerService extends Context.Tag("@arr-hub/MediaServerService")<
  MediaServerService,
  {
    readonly add: (
      input: MediaServerInput,
    ) => Effect.Effect<MediaServerWithHealth, ValidationError | EncryptionError | SqlError>
    readonly list: () => Effect.Effect<ReadonlyArray<MediaServerWithHealth>, SqlError>
    readonly getById: (id: number) => Effect.Effect<MediaServerWithHealth, NotFoundError | SqlError>
    readonly update: (
      id: number,
      data: MediaServerUpdate,
    ) => Effect.Effect<
      MediaServerWithHealth,
      NotFoundError | ValidationError | EncryptionError | SqlError
    >
    readonly remove: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
    readonly testConnection: (
      id: number,
    ) => Effect.Effect<
      MediaServerWithHealth,
      NotFoundError | MediaServerError | ValidationError | EncryptionError | SqlError
    >
    readonly getLibraries: (
      id: number,
    ) => Effect.Effect<
      ReadonlyArray<MediaServerLibraryWithSync>,
      NotFoundError | MediaServerError | ValidationError | EncryptionError | SqlError
    >
    readonly syncLibrary: (
      serverId: number,
      libraryId: string,
    ) => Effect.Effect<
      SyncResult,
      NotFoundError | MediaServerError | ValidationError | EncryptionError | SqlError
    >
    readonly refreshLibrary: (
      serverId: number,
      libraryId: string,
      path: string,
    ) => Effect.Effect<
      void,
      NotFoundError | MediaServerError | ValidationError | EncryptionError | SqlError
    >
    readonly listTypes: () => ReadonlyArray<{
      readonly type: MediaServerType
      readonly metadata: MediaServerAdapterMetadata
    }>
  }
>() {}

// ── Helpers ──

function toWithHealth(
  row: typeof mediaServers.$inferSelect,
  health: typeof mediaServerHealth.$inferSelect | undefined,
): MediaServerWithHealth {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    host: row.host,
    port: row.port,
    useSsl: row.useSsl,
    enabled: row.enabled,
    settings: row.settings,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    health: health
      ? {
          lastCheck: health.lastCheck,
          status: health.status as MediaServerHealthStatus,
          errorMessage: health.errorMessage,
          responseTimeMs: health.responseTimeMs,
        }
      : null,
  }
}

function toLibraryWithSync(
  row: typeof mediaServerLibraries.$inferSelect,
): MediaServerLibraryWithSync {
  return {
    id: row.id,
    mediaServerId: row.mediaServerId,
    externalId: row.externalId,
    name: row.name,
    type: row.type as MediaServerLibraryType,
    enabled: row.enabled,
    lastSynced: row.lastSynced,
  }
}

// ── Live implementation ──

export const MediaServerServiceLive = Layer.effect(
  MediaServerService,
  Effect.gen(function* () {
    const db = yield* Db
    const crypto = yield* CryptoService
    const registry = yield* AdapterRegistry

    const loadWithHealth = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select()
          .from(mediaServers)
          .leftJoin(mediaServerHealth, eq(mediaServers.id, mediaServerHealth.mediaServerId))
          .where(eq(mediaServers.id, id))

        const row = rows[0]
        if (!row) return yield* new NotFoundError({ entity: "media_server", id })
        return toWithHealth(row.media_servers, row.media_server_health ?? undefined)
      })

    const buildConfig = (
      row: typeof mediaServers.$inferSelect,
      token: string,
    ): MediaServerConfig => ({
      id: row.id,
      name: row.name,
      type: row.type,
      host: row.host,
      port: row.port,
      token,
      useSsl: row.useSsl,
      settings: row.settings,
    })

    const makeAdapter = (config: MediaServerConfig) =>
      Effect.gen(function* () {
        const factory = yield* registry.getMediaServerFactory(config.type)
        return factory(config)
      })

    const loadServerAndAdapter = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db.select().from(mediaServers).where(eq(mediaServers.id, id))
        const server = rows[0]
        if (!server) return yield* new NotFoundError({ entity: "media_server", id })

        const token = yield* crypto.decrypt(server.tokenEncrypted)
        const config = buildConfig(server, token)
        const adapter = yield* makeAdapter(config)
        return { server, adapter }
      })

    return {
      add: (input) =>
        Effect.gen(function* () {
          yield* registry.getMediaServerFactory(input.type)
          const encrypted = yield* crypto.encrypt(input.token)
          const inserted = yield* db
            .insert(mediaServers)
            .values({
              name: input.name,
              type: input.type,
              host: input.host,
              port: input.port,
              tokenEncrypted: encrypted,
              useSsl: input.useSsl ?? false,
              enabled: input.enabled ?? true,
              settings: input.settings ?? { syncIntervalMs: 3600000, monitoringEnabled: true },
            })
            .returning()

          return toWithHealth(inserted[0], undefined)
        }),

      list: () =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(mediaServers)
            .leftJoin(mediaServerHealth, eq(mediaServers.id, mediaServerHealth.mediaServerId))
            .orderBy(mediaServers.name)

          return rows.map((r) => toWithHealth(r.media_servers, r.media_server_health ?? undefined))
        }),

      getById: (id) => loadWithHealth(id),

      update: (id, data) =>
        Effect.gen(function* () {
          if (data.type !== undefined) {
            yield* registry.getMediaServerFactory(data.type)
          }
          const updateData: Record<string, unknown> = {}
          if (data.name !== undefined) updateData.name = data.name
          if (data.type !== undefined) updateData.type = data.type
          if (data.host !== undefined) updateData.host = data.host
          if (data.port !== undefined) updateData.port = data.port
          if (data.useSsl !== undefined) updateData.useSsl = data.useSsl
          if (data.enabled !== undefined) updateData.enabled = data.enabled
          if (data.settings !== undefined) updateData.settings = data.settings
          if (data.token !== undefined) {
            updateData.tokenEncrypted = yield* crypto.encrypt(data.token)
          }

          const rows = yield* db
            .update(mediaServers)
            .set(updateData)
            .where(eq(mediaServers.id, id))
            .returning()

          if (rows.length === 0) return yield* new NotFoundError({ entity: "media_server", id })
          return yield* loadWithHealth(id)
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const rows = yield* db
            .delete(mediaServers)
            .where(eq(mediaServers.id, id))
            .returning({ id: mediaServers.id })

          if (rows.length === 0) return yield* new NotFoundError({ entity: "media_server", id })
        }),

      testConnection: (id) =>
        Effect.gen(function* () {
          const { adapter } = yield* loadServerAndAdapter(id)
          const start = Date.now()

          yield* adapter.testConnection().pipe(
            Effect.tapBoth({
              onSuccess: () =>
                db
                  .insert(mediaServerHealth)
                  .values({
                    mediaServerId: id,
                    status: "healthy",
                    responseTimeMs: Date.now() - start,
                    errorMessage: null,
                  })
                  .onConflictDoUpdate({
                    target: mediaServerHealth.mediaServerId,
                    set: {
                      status: "healthy",
                      responseTimeMs: Date.now() - start,
                      errorMessage: null,
                      lastCheck: new Date(),
                    },
                  }),
              onFailure: (err) =>
                db
                  .insert(mediaServerHealth)
                  .values({
                    mediaServerId: id,
                    status: "unhealthy",
                    errorMessage: err.message,
                    responseTimeMs: Date.now() - start,
                  })
                  .onConflictDoUpdate({
                    target: mediaServerHealth.mediaServerId,
                    set: {
                      status: "unhealthy",
                      errorMessage: err.message,
                      responseTimeMs: Date.now() - start,
                      lastCheck: new Date(),
                    },
                  }),
            }),
          )

          return yield* loadWithHealth(id)
        }),

      getLibraries: (id) =>
        Effect.gen(function* () {
          const { server, adapter } = yield* loadServerAndAdapter(id)
          const libs = yield* adapter.getLibraries()

          // Auto-upsert libraries
          for (const lib of libs) {
            yield* db
              .insert(mediaServerLibraries)
              .values({
                mediaServerId: server.id,
                externalId: lib.externalId,
                name: lib.name,
                type: lib.type,
              })
              .onConflictDoUpdate({
                target: [mediaServerLibraries.mediaServerId, mediaServerLibraries.externalId],
                set: { name: lib.name, type: lib.type },
              })
          }

          const rows = yield* db
            .select()
            .from(mediaServerLibraries)
            .where(eq(mediaServerLibraries.mediaServerId, server.id))

          return rows.map(toLibraryWithSync)
        }),

      syncLibrary: (serverId, libraryId) =>
        Effect.gen(function* () {
          const { adapter } = yield* loadServerAndAdapter(serverId)

          // Verify library exists in our DB
          const libRows = yield* db
            .select()
            .from(mediaServerLibraries)
            .where(
              and(
                eq(mediaServerLibraries.mediaServerId, serverId),
                eq(mediaServerLibraries.externalId, libraryId),
              ),
            )
          const lib = libRows[0]
          if (!lib) {
            return yield* new NotFoundError({ entity: "media_server_library", id: libraryId })
          }

          const syncedItems = yield* adapter.syncLibrary(libraryId)
          let matched = 0
          let unmatched = 0

          for (const synced of syncedItems) {
            if (synced.kind === "movie") {
              const { tmdbId, filePath } = synced.item
              if (tmdbId === null) {
                unmatched++
                continue
              }

              const updated = yield* db
                .update(movies)
                .set({ hasFile: true, filePath, status: "available" })
                .where(eq(movies.tmdbId, tmdbId))
                .returning({ id: movies.id })

              if (updated.length > 0) matched++
              else unmatched++
            } else {
              const { seriesTvdbId, seasonNumber, episodeNumber, filePath } = synced.item
              if (seriesTvdbId === null) {
                unmatched++
                continue
              }

              // Find series by tvdbId
              const seriesRows = yield* db
                .select({ id: series.id })
                .from(series)
                .where(eq(series.tvdbId, seriesTvdbId))
              const s = seriesRows[0]
              if (!s) {
                unmatched++
                continue
              }

              // Find season
              const seasonRows = yield* db
                .select({ id: seasons.id })
                .from(seasons)
                .where(and(eq(seasons.seriesId, s.id), eq(seasons.seasonNumber, seasonNumber)))
              const season = seasonRows[0]
              if (!season) {
                unmatched++
                continue
              }

              // Find episode
              const updated = yield* db
                .update(episodes)
                .set({ hasFile: true, filePath })
                .where(
                  and(eq(episodes.seasonId, season.id), eq(episodes.episodeNumber, episodeNumber)),
                )
                .returning({ id: episodes.id })

              if (updated.length > 0) matched++
              else unmatched++
            }
          }

          // Update lastSynced
          yield* db
            .update(mediaServerLibraries)
            .set({ lastSynced: new Date() })
            .where(eq(mediaServerLibraries.id, lib.id))

          return { matched, unmatched, libraryId }
        }),

      refreshLibrary: (serverId, libraryId, path) =>
        Effect.gen(function* () {
          const { adapter } = yield* loadServerAndAdapter(serverId)
          yield* adapter.refreshLibrary(libraryId, path)
        }),

      listTypes: () => registry.listMediaServerTypes(),
    }
  }),
)

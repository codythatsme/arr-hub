import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { downloadClients, downloadClientHealth, downloadQueue } from "#/db/schema"

import type {
  AddDownloadOptions,
  DownloadClientConfig,
  DownloadClientHealthStatus,
  DownloadClientSettings,
  DownloadClientType,
  DownloadClientWithHealth,
  DownloadStatus,
  NormalizedDownloadStatus,
} from "../domain/downloadClient"
import { DownloadClientError, NotFoundError, type EncryptionError } from "../errors"
import { CryptoService } from "./CryptoService"
import { Db } from "./Db"
import { createQBittorrentAdapter } from "./DownloadClientAdapter"

// ── Input types ──

interface DownloadClientInput {
  readonly name: string
  readonly type: DownloadClientType
  readonly host: string
  readonly port: number
  readonly username: string
  readonly password: string
  readonly useSsl?: boolean
  readonly category?: string
  readonly enabled?: boolean
  readonly priority?: number
  readonly settings?: DownloadClientSettings
}

interface DownloadClientUpdate {
  readonly name?: string
  readonly type?: DownloadClientType
  readonly host?: string
  readonly port?: number
  readonly username?: string
  readonly password?: string
  readonly useSsl?: boolean
  readonly category?: string | null
  readonly enabled?: boolean
  readonly priority?: number
  readonly settings?: DownloadClientSettings
}

// ── Service tag ──

export class DownloadClientService extends Context.Tag("@arr-hub/DownloadClientService")<
  DownloadClientService,
  {
    readonly add: (
      input: DownloadClientInput,
    ) => Effect.Effect<DownloadClientWithHealth, EncryptionError | SqlError>
    readonly list: () => Effect.Effect<ReadonlyArray<DownloadClientWithHealth>, SqlError>
    readonly getById: (
      id: number,
    ) => Effect.Effect<DownloadClientWithHealth, NotFoundError | SqlError>
    readonly update: (
      id: number,
      data: DownloadClientUpdate,
    ) => Effect.Effect<DownloadClientWithHealth, NotFoundError | EncryptionError | SqlError>
    readonly remove: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
    readonly testConnection: (
      id: number,
    ) => Effect.Effect<
      DownloadClientWithHealth,
      NotFoundError | DownloadClientError | EncryptionError | SqlError
    >
    readonly addDownload: (
      clientId: number,
      url: string,
      options?: AddDownloadOptions,
    ) => Effect.Effect<string, NotFoundError | DownloadClientError | EncryptionError | SqlError>
    readonly getQueue: (
      clientId?: number,
    ) => Effect.Effect<
      ReadonlyArray<DownloadStatus>,
      NotFoundError | DownloadClientError | EncryptionError | SqlError
    >
    readonly removeDownload: (
      clientId: number,
      externalId: string,
      deleteFiles: boolean,
    ) => Effect.Effect<void, NotFoundError | DownloadClientError | EncryptionError | SqlError>
  }
>() {}

// ── Helpers ──

function toWithHealth(
  row: typeof downloadClients.$inferSelect,
  health: typeof downloadClientHealth.$inferSelect | undefined,
): DownloadClientWithHealth {
  return {
    id: row.id,
    name: row.name,
    type: row.type as DownloadClientType,
    host: row.host,
    port: row.port,
    username: row.username,
    useSsl: row.useSsl,
    category: row.category,
    priority: row.priority,
    enabled: row.enabled,
    settings: row.settings,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    health: health
      ? {
          lastCheck: health.lastCheck,
          status: health.status as DownloadClientHealthStatus,
          errorMessage: health.errorMessage,
          responseTimeMs: health.responseTimeMs,
        }
      : null,
  }
}

// ── Live implementation ──

export const DownloadClientServiceLive = Layer.effect(
  DownloadClientService,
  Effect.gen(function* () {
    const db = yield* Db
    const crypto = yield* CryptoService

    const loadWithHealth = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select()
          .from(downloadClients)
          .leftJoin(
            downloadClientHealth,
            eq(downloadClients.id, downloadClientHealth.downloadClientId),
          )
          .where(eq(downloadClients.id, id))

        const row = rows[0]
        if (!row) return yield* new NotFoundError({ entity: "download_client", id })
        return toWithHealth(row.download_clients, row.download_client_health ?? undefined)
      })

    const buildConfig = (
      row: typeof downloadClients.$inferSelect,
      password: string,
    ): DownloadClientConfig => ({
      id: row.id,
      name: row.name,
      type: row.type as DownloadClientType,
      host: row.host,
      port: row.port,
      username: row.username,
      password,
      useSsl: row.useSsl,
      category: row.category,
      settings: row.settings,
    })

    const makeAdapter = (config: DownloadClientConfig) => {
      switch (config.type) {
        case "qbittorrent":
          return createQBittorrentAdapter(config)
      }
    }

    return {
      add: (input) =>
        Effect.gen(function* () {
          const encrypted = yield* crypto.encrypt(input.password)
          const inserted = yield* db
            .insert(downloadClients)
            .values({
              name: input.name,
              type: input.type,
              host: input.host,
              port: input.port,
              username: input.username,
              passwordEncrypted: encrypted,
              useSsl: input.useSsl ?? false,
              category: input.category ?? null,
              enabled: input.enabled ?? true,
              priority: input.priority ?? 50,
              settings: input.settings ?? { pollIntervalMs: 5000 },
            })
            .returning()

          return toWithHealth(inserted[0], undefined)
        }),

      list: () =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(downloadClients)
            .leftJoin(
              downloadClientHealth,
              eq(downloadClients.id, downloadClientHealth.downloadClientId),
            )
            .orderBy(downloadClients.priority)

          return rows.map((r) =>
            toWithHealth(r.download_clients, r.download_client_health ?? undefined),
          )
        }),

      getById: (id) => loadWithHealth(id),

      update: (id, data) =>
        Effect.gen(function* () {
          const updateData: Record<string, unknown> = {}
          if (data.name !== undefined) updateData.name = data.name
          if (data.type !== undefined) updateData.type = data.type
          if (data.host !== undefined) updateData.host = data.host
          if (data.port !== undefined) updateData.port = data.port
          if (data.username !== undefined) updateData.username = data.username
          if (data.useSsl !== undefined) updateData.useSsl = data.useSsl
          if (data.category !== undefined) updateData.category = data.category
          if (data.enabled !== undefined) updateData.enabled = data.enabled
          if (data.priority !== undefined) updateData.priority = data.priority
          if (data.settings !== undefined) updateData.settings = data.settings
          if (data.password !== undefined) {
            updateData.passwordEncrypted = yield* crypto.encrypt(data.password)
          }

          const rows = yield* db
            .update(downloadClients)
            .set(updateData)
            .where(eq(downloadClients.id, id))
            .returning()

          if (rows.length === 0) return yield* new NotFoundError({ entity: "download_client", id })
          return yield* loadWithHealth(id)
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const rows = yield* db
            .delete(downloadClients)
            .where(eq(downloadClients.id, id))
            .returning({ id: downloadClients.id })

          if (rows.length === 0) return yield* new NotFoundError({ entity: "download_client", id })
        }),

      testConnection: (id) =>
        Effect.gen(function* () {
          const row = yield* db.select().from(downloadClients).where(eq(downloadClients.id, id))
          const client = row[0]
          if (!client) return yield* new NotFoundError({ entity: "download_client", id })

          const password = yield* crypto.decrypt(client.passwordEncrypted)
          const config = buildConfig(client, password)
          const adapter = makeAdapter(config)
          const start = Date.now()

          yield* adapter.testConnection().pipe(
            Effect.tapBoth({
              onSuccess: () =>
                db
                  .insert(downloadClientHealth)
                  .values({
                    downloadClientId: id,
                    status: "healthy",
                    responseTimeMs: Date.now() - start,
                    errorMessage: null,
                  })
                  .onConflictDoUpdate({
                    target: downloadClientHealth.downloadClientId,
                    set: {
                      status: "healthy",
                      responseTimeMs: Date.now() - start,
                      errorMessage: null,
                      lastCheck: new Date(),
                    },
                  }),
              onFailure: (err) =>
                db
                  .insert(downloadClientHealth)
                  .values({
                    downloadClientId: id,
                    status: "unhealthy",
                    errorMessage: err.message,
                    responseTimeMs: Date.now() - start,
                  })
                  .onConflictDoUpdate({
                    target: downloadClientHealth.downloadClientId,
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

      addDownload: (clientId, url, options) =>
        Effect.gen(function* () {
          const row = yield* db
            .select()
            .from(downloadClients)
            .where(eq(downloadClients.id, clientId))
          const client = row[0]
          if (!client) return yield* new NotFoundError({ entity: "download_client", id: clientId })

          const password = yield* crypto.decrypt(client.passwordEncrypted)
          const config = buildConfig(client, password)
          const adapter = makeAdapter(config)

          const hash = yield* adapter.addDownload(url, options)

          // Eagerly insert queue row
          yield* db.insert(downloadQueue).values({
            downloadClientId: clientId,
            externalId: hash,
            status: "queued",
            title: url,
            sizeBytes: 0,
            progress: 0,
          })

          return hash
        }),

      getQueue: (clientId) =>
        Effect.gen(function* () {
          const clientRows = clientId
            ? yield* db.select().from(downloadClients).where(eq(downloadClients.id, clientId))
            : yield* db.select().from(downloadClients).where(eq(downloadClients.enabled, true))

          if (clientId && clientRows.length === 0) {
            return yield* new NotFoundError({ entity: "download_client", id: clientId })
          }

          const allStatuses = yield* Effect.forEach(
            clientRows,
            (client) =>
              Effect.gen(function* () {
                const password = yield* crypto.decrypt(client.passwordEncrypted)
                const config = buildConfig(client, password)
                const adapter = makeAdapter(config)
                const statuses = yield* adapter.getQueue()

                // Upsert queue rows
                for (const status of statuses) {
                  yield* db
                    .insert(downloadQueue)
                    .values({
                      downloadClientId: client.id,
                      externalId: status.externalId,
                      status: status.status,
                      title: status.title,
                      sizeBytes: status.sizeBytes,
                      progress: status.progressFraction,
                      etaSeconds: status.etaSeconds ?? null,
                      errorMessage: status.errorMessage,
                    })
                    .onConflictDoUpdate({
                      target: downloadQueue.externalId,
                      set: {
                        status: status.status as NormalizedDownloadStatus,
                        title: status.title,
                        sizeBytes: status.sizeBytes,
                        progress: status.progressFraction,
                        etaSeconds: status.etaSeconds ?? null,
                        errorMessage: status.errorMessage,
                        updatedAt: new Date(),
                      },
                    })
                }

                return statuses
              }),
            { concurrency: "unbounded" },
          )

          return allStatuses.flat()
        }),

      removeDownload: (clientId, externalId, deleteFiles) =>
        Effect.gen(function* () {
          const row = yield* db
            .select()
            .from(downloadClients)
            .where(eq(downloadClients.id, clientId))
          const client = row[0]
          if (!client) return yield* new NotFoundError({ entity: "download_client", id: clientId })

          const password = yield* crypto.decrypt(client.passwordEncrypted)
          const config = buildConfig(client, password)
          const adapter = makeAdapter(config)

          yield* adapter.removeDownload(externalId, deleteFiles)

          yield* db.delete(downloadQueue).where(eq(downloadQueue.externalId, externalId))
        }),
    }
  }),
)

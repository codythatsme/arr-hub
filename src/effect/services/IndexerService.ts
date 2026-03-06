import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Either, Layer } from "effect"

import { indexers, indexerHealth } from "#/db/schema"

import type {
  IndexerAdapterMetadata,
  IndexerConfig,
  IndexerWithHealth,
  IndexerHealthStatus,
  ReleaseCandidate,
  SearchQuery,
  SearchResult,
  IndexerType,
} from "../domain/indexer"
import { NotFoundError, IndexerError, type EncryptionError, type ValidationError } from "../errors"
import { AdapterRegistry } from "./AdapterRegistry"
import { CryptoService } from "./CryptoService"
import { Db } from "./Db"

// ── Input types ──

interface IndexerInput {
  readonly name: string
  readonly type: IndexerType
  readonly baseUrl: string
  readonly apiKey: string
  readonly enabled?: boolean
  readonly priority?: number
  readonly categories?: ReadonlyArray<number>
}

interface IndexerUpdate {
  readonly name?: string
  readonly type?: IndexerType
  readonly baseUrl?: string
  readonly apiKey?: string
  readonly enabled?: boolean
  readonly priority?: number
  readonly categories?: ReadonlyArray<number>
}

// ── Service tag ──

export class IndexerService extends Context.Tag("@arr-hub/IndexerService")<
  IndexerService,
  {
    readonly add: (
      input: IndexerInput,
    ) => Effect.Effect<IndexerWithHealth, ValidationError | EncryptionError | SqlError>
    readonly list: () => Effect.Effect<ReadonlyArray<IndexerWithHealth>, SqlError>
    readonly getById: (id: number) => Effect.Effect<IndexerWithHealth, NotFoundError | SqlError>
    readonly update: (
      id: number,
      data: IndexerUpdate,
    ) => Effect.Effect<
      IndexerWithHealth,
      NotFoundError | ValidationError | EncryptionError | SqlError
    >
    readonly remove: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
    readonly testConnection: (
      id: number,
    ) => Effect.Effect<
      IndexerWithHealth,
      NotFoundError | IndexerError | ValidationError | EncryptionError | SqlError
    >
    readonly search: (
      query: SearchQuery,
    ) => Effect.Effect<SearchResult, ValidationError | EncryptionError | SqlError>
    readonly listTypes: () => ReadonlyArray<{
      readonly type: IndexerType
      readonly metadata: IndexerAdapterMetadata
    }>
  }
>() {}

// ── Helpers ──

function toWithHealth(
  row: typeof indexers.$inferSelect,
  health: typeof indexerHealth.$inferSelect | undefined,
): IndexerWithHealth {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    baseUrl: row.baseUrl,
    enabled: row.enabled,
    priority: row.priority,
    categories: row.categories,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    health: health
      ? {
          lastCheck: health.lastCheck,
          status: health.status as IndexerHealthStatus,
          errorMessage: health.errorMessage,
          responseTimeMs: health.responseTimeMs,
        }
      : null,
  }
}

// ── Live implementation ──

export const IndexerServiceLive = Layer.effect(
  IndexerService,
  Effect.gen(function* () {
    const db = yield* Db
    const crypto = yield* CryptoService
    const registry = yield* AdapterRegistry

    const lookupProtocol = (type: string) => {
      const entry = registry.listIndexerTypes().find((e) => e.type === type)
      return entry?.metadata.protocolAffinity ?? ("torrent" as const)
    }

    const loadWithHealth = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select()
          .from(indexers)
          .leftJoin(indexerHealth, eq(indexers.id, indexerHealth.indexerId))
          .where(eq(indexers.id, id))

        const row = rows[0]
        if (!row) return yield* new NotFoundError({ entity: "indexer", id })
        return toWithHealth(row.indexers, row.indexer_health ?? undefined)
      })

    return {
      add: (input) =>
        Effect.gen(function* () {
          yield* registry.getIndexerFactory(input.type)
          const encrypted = yield* crypto.encrypt(input.apiKey)
          const inserted = yield* db
            .insert(indexers)
            .values({
              name: input.name,
              type: input.type,
              baseUrl: input.baseUrl,
              apiKeyEncrypted: encrypted,
              enabled: input.enabled ?? true,
              priority: input.priority ?? 50,
              categories: input.categories ?? [],
            })
            .returning()

          return toWithHealth(inserted[0], undefined)
        }),

      list: () =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(indexers)
            .leftJoin(indexerHealth, eq(indexers.id, indexerHealth.indexerId))
            .orderBy(indexers.priority)

          return rows.map((r) => toWithHealth(r.indexers, r.indexer_health ?? undefined))
        }),

      getById: (id) => loadWithHealth(id),

      update: (id, data) =>
        Effect.gen(function* () {
          if (data.type !== undefined) {
            yield* registry.getIndexerFactory(data.type)
          }
          const updateData: Record<string, unknown> = {}
          if (data.name !== undefined) updateData.name = data.name
          if (data.type !== undefined) updateData.type = data.type
          if (data.baseUrl !== undefined) updateData.baseUrl = data.baseUrl
          if (data.enabled !== undefined) updateData.enabled = data.enabled
          if (data.priority !== undefined) updateData.priority = data.priority
          if (data.categories !== undefined) updateData.categories = data.categories
          if (data.apiKey !== undefined) {
            updateData.apiKeyEncrypted = yield* crypto.encrypt(data.apiKey)
          }

          const rows = yield* db
            .update(indexers)
            .set(updateData)
            .where(eq(indexers.id, id))
            .returning()

          if (rows.length === 0) return yield* new NotFoundError({ entity: "indexer", id })
          return yield* loadWithHealth(id)
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const rows = yield* db
            .delete(indexers)
            .where(eq(indexers.id, id))
            .returning({ id: indexers.id })

          if (rows.length === 0) return yield* new NotFoundError({ entity: "indexer", id })
        }),

      testConnection: (id) =>
        Effect.gen(function* () {
          const row = yield* db.select().from(indexers).where(eq(indexers.id, id))
          const indexer = row[0]
          if (!indexer) return yield* new NotFoundError({ entity: "indexer", id })

          const apiKey = yield* crypto.decrypt(indexer.apiKeyEncrypted)
          const factory = yield* registry.getIndexerFactory(indexer.type)
          const config: IndexerConfig = {
            id: indexer.id,
            name: indexer.name,
            type: indexer.type,
            baseUrl: indexer.baseUrl,
            apiKey,
            priority: indexer.priority,
            categories: indexer.categories,
            protocol: lookupProtocol(indexer.type),
          }

          const adapter = factory(config)
          const start = Date.now()

          yield* adapter.testConnection().pipe(
            Effect.tapBoth({
              onSuccess: () =>
                db
                  .insert(indexerHealth)
                  .values({
                    indexerId: id,
                    status: "healthy",
                    responseTimeMs: Date.now() - start,
                    errorMessage: null,
                  })
                  .onConflictDoUpdate({
                    target: indexerHealth.indexerId,
                    set: {
                      status: "healthy",
                      responseTimeMs: Date.now() - start,
                      errorMessage: null,
                      lastCheck: new Date(),
                    },
                  }),
              onFailure: (err) =>
                db
                  .insert(indexerHealth)
                  .values({
                    indexerId: id,
                    status: "unhealthy",
                    errorMessage: err.message,
                    responseTimeMs: Date.now() - start,
                  })
                  .onConflictDoUpdate({
                    target: indexerHealth.indexerId,
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

      search: (query) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(indexers)
            .where(eq(indexers.enabled, true))
            .orderBy(indexers.priority)

          const results = yield* Effect.forEach(
            rows,
            (indexer) =>
              Effect.gen(function* () {
                const apiKey = yield* crypto.decrypt(indexer.apiKeyEncrypted)
                const factory = yield* registry.getIndexerFactory(indexer.type)
                const config: IndexerConfig = {
                  id: indexer.id,
                  name: indexer.name,
                  type: indexer.type,
                  baseUrl: indexer.baseUrl,
                  apiKey,
                  priority: indexer.priority,
                  categories: indexer.categories,
                  protocol: lookupProtocol(indexer.type),
                }
                const adapter = factory(config)
                return yield* adapter.search(query)
              }).pipe(Effect.either),
            { concurrency: "unbounded" },
          )

          const releases: Array<ReleaseCandidate> = []
          const errors: Array<IndexerError> = []

          for (const either of results) {
            if (Either.isRight(either)) {
              releases.push(...either.right)
            } else {
              const err = either.left
              if (err._tag === "IndexerError") {
                errors.push(err)
              }
            }
          }

          // Sort by priority (lower = higher priority), then by seeders desc for torrents
          releases.sort((a, b) => {
            if (a.indexerPriority !== b.indexerPriority)
              return a.indexerPriority - b.indexerPriority
            const aSeeders = a.seeders ?? 0
            const bSeeders = b.seeders ?? 0
            return bSeeders - aSeeders
          })

          return { releases, errors } satisfies SearchResult
        }),

      listTypes: () => registry.listIndexerTypes(),
    }
  }),
)

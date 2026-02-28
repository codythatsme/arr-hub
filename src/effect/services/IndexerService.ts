import { Context, Effect, Either, Layer } from 'effect'
import { SqlError } from '@effect/sql/SqlError'
import { eq } from 'drizzle-orm'
import { indexers, indexerHealth } from '#/db/schema'
import { Db } from './Db'
import { CryptoService } from './CryptoService'
import { createAdapter } from './IndexerAdapter'
import { NotFoundError, IndexerError, type EncryptionError } from '../errors'
import type {
  IndexerConfig,
  IndexerWithHealth,
  IndexerHealthStatus,
  ReleaseCandidate,
  SearchQuery,
  SearchResult,
  IndexerType,
} from '../domain/indexer'

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

export class IndexerService extends Context.Tag('@arr-hub/IndexerService')<
  IndexerService,
  {
    readonly add: (input: IndexerInput) => Effect.Effect<IndexerWithHealth, EncryptionError | SqlError>
    readonly list: () => Effect.Effect<ReadonlyArray<IndexerWithHealth>, SqlError>
    readonly getById: (id: number) => Effect.Effect<IndexerWithHealth, NotFoundError | SqlError>
    readonly update: (id: number, data: IndexerUpdate) => Effect.Effect<IndexerWithHealth, NotFoundError | EncryptionError | SqlError>
    readonly remove: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
    readonly testConnection: (id: number) => Effect.Effect<IndexerWithHealth, NotFoundError | IndexerError | EncryptionError | SqlError>
    readonly search: (query: SearchQuery) => Effect.Effect<SearchResult, EncryptionError | SqlError>
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
    type: row.type as IndexerType,
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

    const loadWithHealth = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select()
          .from(indexers)
          .leftJoin(indexerHealth, eq(indexers.id, indexerHealth.indexerId))
          .where(eq(indexers.id, id))

        const row = rows[0]
        if (!row) return yield* new NotFoundError({ entity: 'indexer', id })
        return toWithHealth(row.indexers, row.indexer_health ?? undefined)
      })

    return {
      add: (input) =>
        Effect.gen(function* () {
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

          if (rows.length === 0) return yield* new NotFoundError({ entity: 'indexer', id })
          return yield* loadWithHealth(id)
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const rows = yield* db
            .delete(indexers)
            .where(eq(indexers.id, id))
            .returning({ id: indexers.id })

          if (rows.length === 0) return yield* new NotFoundError({ entity: 'indexer', id })
        }),

      testConnection: (id) =>
        Effect.gen(function* () {
          const row = yield* db.select().from(indexers).where(eq(indexers.id, id))
          const indexer = row[0]
          if (!indexer) return yield* new NotFoundError({ entity: 'indexer', id })

          const apiKey = yield* crypto.decrypt(indexer.apiKeyEncrypted)
          const config: IndexerConfig = {
            id: indexer.id,
            name: indexer.name,
            type: indexer.type as IndexerType,
            baseUrl: indexer.baseUrl,
            apiKey,
            priority: indexer.priority,
            categories: indexer.categories,
          }

          const adapter = createAdapter(config)
          const start = Date.now()

          yield* adapter.testConnection().pipe(
            Effect.tapBoth({
              onSuccess: () =>
                db
                  .insert(indexerHealth)
                  .values({
                    indexerId: id,
                    status: 'healthy',
                    responseTimeMs: Date.now() - start,
                    errorMessage: null,
                  })
                  .onConflictDoUpdate({
                    target: indexerHealth.indexerId,
                    set: {
                      status: 'healthy',
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
                    status: 'unhealthy',
                    errorMessage: err.message,
                    responseTimeMs: Date.now() - start,
                  })
                  .onConflictDoUpdate({
                    target: indexerHealth.indexerId,
                    set: {
                      status: 'unhealthy',
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
                const config: IndexerConfig = {
                  id: indexer.id,
                  name: indexer.name,
                  type: indexer.type as IndexerType,
                  baseUrl: indexer.baseUrl,
                  apiKey,
                  priority: indexer.priority,
                  categories: indexer.categories,
                }
                const adapter = createAdapter(config)
                return yield* adapter.search(query)
              }).pipe(Effect.either),
            { concurrency: 'unbounded' },
          )

          const releases: Array<ReleaseCandidate> = []
          const errors: Array<IndexerError> = []

          for (const either of results) {
            if (Either.isRight(either)) {
              releases.push(...either.right)
            } else {
              const err = either.left
              if (err._tag === 'IndexerError') {
                errors.push(err)
              }
            }
          }

          // Sort by priority (lower = higher priority), then by seeders desc for torrents
          releases.sort((a, b) => {
            if (a.indexerPriority !== b.indexerPriority) return a.indexerPriority - b.indexerPriority
            const aSeeders = a.seeders ?? 0
            const bSeeders = b.seeders ?? 0
            return bSeeders - aSeeders
          })

          return { releases, errors } satisfies SearchResult
        }),
    }
  }),
)

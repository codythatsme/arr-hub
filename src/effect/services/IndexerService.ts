import { SqlError } from "@effect/sql/SqlError"
import { and, eq } from "drizzle-orm"
import { Context, Effect, Either, Layer } from "effect"

import {
  indexers,
  indexerDefinitions,
  indexerHealth,
  indexerProxies,
  indexerStats,
} from "#/db/schema"

import type {
  IndexerAdapterMetadata,
  IndexerCapabilities,
  IndexerConfig,
  IndexerDefinition,
  IndexerDefinitionSeed,
  IndexerProtocol,
  IndexerProxy,
  IndexerProxySettings,
  IndexerProxyType,
  IndexerStats,
  IndexerWithHealth,
  IndexerHealthStatus,
  ReleaseCandidate,
  SearchQuery,
  SearchResult,
  IndexerType,
} from "../domain/indexer"
import { NotFoundError, IndexerError, ValidationError, type EncryptionError } from "../errors"
import { AdapterRegistry } from "./AdapterRegistry"
import { CryptoService } from "./CryptoService"
import { Db } from "./Db"

// ── Input types ──

interface IndexerInput {
  readonly name: string
  readonly type: IndexerType
  readonly definitionKey?: string | null
  readonly baseUrl: string
  readonly apiKey: string
  readonly proxyId?: number | null
  readonly enabled?: boolean
  readonly searchEnabled?: boolean
  readonly rssEnabled?: boolean
  readonly priority?: number
  readonly categories?: ReadonlyArray<number>
  readonly tags?: ReadonlyArray<string>
}

interface IndexerUpdate {
  readonly name?: string
  readonly type?: IndexerType
  readonly definitionKey?: string | null
  readonly baseUrl?: string
  readonly apiKey?: string
  readonly proxyId?: number | null
  readonly enabled?: boolean
  readonly searchEnabled?: boolean
  readonly rssEnabled?: boolean
  readonly priority?: number
  readonly categories?: ReadonlyArray<number>
  readonly tags?: ReadonlyArray<string>
}

interface IndexerProxyInput {
  readonly name: string
  readonly type: IndexerProxyType
  readonly host: string
  readonly port?: number | null
  readonly username?: string | null
  readonly password?: string | null
  readonly enabled?: boolean
  readonly settings?: IndexerProxySettings
}

interface IndexerProxyUpdate {
  readonly name?: string
  readonly type?: IndexerProxyType
  readonly host?: string
  readonly port?: number | null
  readonly username?: string | null
  readonly password?: string | null
  readonly enabled?: boolean
  readonly settings?: IndexerProxySettings
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
    readonly seedBuiltInDefinitions: () => Effect.Effect<void, SqlError>
    readonly listDefinitions: () => Effect.Effect<ReadonlyArray<IndexerDefinition>, SqlError>
    readonly listStats: () => Effect.Effect<ReadonlyArray<IndexerStats>, SqlError>
    readonly aggregateCapabilities: (
      protocol?: IndexerProtocol,
    ) => Effect.Effect<IndexerCapabilities, SqlError>
    readonly addProxy: (
      input: IndexerProxyInput,
    ) => Effect.Effect<IndexerProxy, EncryptionError | SqlError>
    readonly listProxies: () => Effect.Effect<ReadonlyArray<IndexerProxy>, SqlError>
    readonly updateProxy: (
      id: number,
      data: IndexerProxyUpdate,
    ) => Effect.Effect<IndexerProxy, NotFoundError | EncryptionError | SqlError>
    readonly removeProxy: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
    readonly listTypes: () => ReadonlyArray<{
      readonly type: IndexerType
      readonly metadata: IndexerAdapterMetadata
    }>
  }
>() {}

// ── Helpers ──

const COMMON_CATEGORIES = [
  { trackerCategory: "Movies", trackerCategoryDesc: "Movies", newznabCategory: 2000 },
  { trackerCategory: "TV", trackerCategoryDesc: "TV", newznabCategory: 5000 },
]

const GENERIC_CAPABILITIES = {
  searchTypes: ["search", "movie", "tvsearch"],
  categories: COMMON_CATEGORIES.map((category) => ({
    id: category.newznabCategory,
    name: category.trackerCategoryDesc,
  })),
}

const BUILT_IN_DEFINITIONS: ReadonlyArray<IndexerDefinitionSeed> = [
  {
    definitionKey: "generic-torznab",
    displayName: "Generic Torznab",
    protocol: "torrent",
    implementation: "torznab",
    baseUrl: null,
    privacy: "private",
    supportsRss: true,
    supportsSearch: true,
    authFields: [
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        required: true,
        helpText: "Torznab-compatible API key.",
      },
    ],
    categories: COMMON_CATEGORIES,
    capabilities: GENERIC_CAPABILITIES,
    tags: ["torznab", "torrent", "generic"],
    version: "builtin-1",
  },
  {
    definitionKey: "generic-newznab",
    displayName: "Generic Newznab",
    protocol: "usenet",
    implementation: "newznab",
    baseUrl: null,
    privacy: "private",
    supportsRss: true,
    supportsSearch: true,
    authFields: [
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        required: true,
        helpText: "Newznab-compatible API key.",
      },
    ],
    categories: COMMON_CATEGORIES,
    capabilities: GENERIC_CAPABILITIES,
    tags: ["newznab", "usenet", "generic"],
    version: "builtin-1",
  },
]

function defaultDefinitionKey(type: string): string | null {
  if (type === "torznab") return "generic-torznab"
  if (type === "newznab") return "generic-newznab"
  return null
}

function toWithHealth(
  row: typeof indexers.$inferSelect,
  health: typeof indexerHealth.$inferSelect | undefined,
): IndexerWithHealth {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    definitionKey: row.definitionKey,
    baseUrl: row.baseUrl,
    proxyId: row.proxyId,
    enabled: row.enabled,
    searchEnabled: row.searchEnabled,
    rssEnabled: row.rssEnabled,
    priority: row.priority,
    categories: row.categories,
    tags: row.tags,
    capabilities: row.capabilities ?? null,
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

function toDefinition(row: typeof indexerDefinitions.$inferSelect): IndexerDefinition {
  return {
    id: row.id,
    definitionKey: row.definitionKey,
    displayName: row.displayName,
    protocol: row.protocol,
    implementation: row.implementation,
    baseUrl: row.baseUrl,
    privacy: row.privacy,
    supportsRss: row.supportsRss,
    supportsSearch: row.supportsSearch,
    authFields: row.authFields,
    categories: row.categories,
    capabilities: row.capabilities,
    tags: row.tags,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toProxy(row: typeof indexerProxies.$inferSelect): IndexerProxy {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    host: row.host,
    port: row.port,
    username: row.username,
    enabled: row.enabled,
    settings: row.settings,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toStats(row: typeof indexerStats.$inferSelect, indexerName: string | null): IndexerStats {
  return {
    indexerId: row.indexerId,
    indexerName: indexerName ?? `Indexer ${row.indexerId}`,
    totalSearches: row.totalSearches,
    successfulSearches: row.successfulSearches,
    failedSearches: row.failedSearches,
    totalRss: row.totalRss,
    successfulRss: row.successfulRss,
    failedRss: row.failedRss,
    averageResponseTimeMs: row.averageResponseTimeMs,
    lastSearchAt: row.lastSearchAt,
    lastRssAt: row.lastRssAt,
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

    const seedBuiltInDefinitions = () =>
      Effect.forEach(
        BUILT_IN_DEFINITIONS,
        (definition) =>
          db
            .insert(indexerDefinitions)
            .values(definition)
            .onConflictDoUpdate({
              target: indexerDefinitions.definitionKey,
              set: {
                displayName: definition.displayName,
                protocol: definition.protocol,
                implementation: definition.implementation,
                baseUrl: definition.baseUrl,
                privacy: definition.privacy,
                supportsRss: definition.supportsRss,
                supportsSearch: definition.supportsSearch,
                authFields: definition.authFields,
                categories: definition.categories,
                capabilities: definition.capabilities,
                tags: definition.tags,
                version: definition.version,
                updatedAt: new Date(),
              },
            }),
        { discard: true },
      )

    const validateDefinitionKey = (definitionKey: string | null | undefined) =>
      Effect.gen(function* () {
        if (definitionKey === undefined || definitionKey === null) return
        yield* seedBuiltInDefinitions()
        const rows = yield* db
          .select({ id: indexerDefinitions.id })
          .from(indexerDefinitions)
          .where(eq(indexerDefinitions.definitionKey, definitionKey))
        if (rows.length === 0) {
          return yield* new ValidationError({
            message: `unknown indexer definition: "${definitionKey}"`,
          })
        }
      })

    const validateProxyId = (proxyId: number | null | undefined) =>
      Effect.gen(function* () {
        if (proxyId === undefined || proxyId === null) return
        const rows = yield* db
          .select({ id: indexerProxies.id })
          .from(indexerProxies)
          .where(eq(indexerProxies.id, proxyId))
        if (rows.length === 0) {
          return yield* new ValidationError({ message: `unknown indexer proxy: ${proxyId}` })
        }
      })

    const recordIndexerActivity = (
      indexerId: number,
      kind: "search" | "rss",
      success: boolean,
      responseTimeMs: number,
    ) =>
      Effect.gen(function* () {
        const now = new Date()
        const rows = yield* db
          .select()
          .from(indexerStats)
          .where(eq(indexerStats.indexerId, indexerId))
        const current = rows[0]

        if (!current) {
          yield* db.insert(indexerStats).values({
            indexerId,
            totalSearches: kind === "search" ? 1 : 0,
            successfulSearches: kind === "search" && success ? 1 : 0,
            failedSearches: kind === "search" && !success ? 1 : 0,
            totalRss: kind === "rss" ? 1 : 0,
            successfulRss: kind === "rss" && success ? 1 : 0,
            failedRss: kind === "rss" && !success ? 1 : 0,
            averageResponseTimeMs: responseTimeMs,
            lastSearchAt: kind === "search" ? now : null,
            lastRssAt: kind === "rss" ? now : null,
          })
          return
        }

        const priorResponses = current.totalSearches + current.totalRss
        const previousAverage = current.averageResponseTimeMs ?? responseTimeMs
        const averageResponseTimeMs = Math.round(
          (previousAverage * priorResponses + responseTimeMs) / (priorResponses + 1),
        )

        yield* db
          .update(indexerStats)
          .set({
            totalSearches: current.totalSearches + (kind === "search" ? 1 : 0),
            successfulSearches: current.successfulSearches + (kind === "search" && success ? 1 : 0),
            failedSearches: current.failedSearches + (kind === "search" && !success ? 1 : 0),
            totalRss: current.totalRss + (kind === "rss" ? 1 : 0),
            successfulRss: current.successfulRss + (kind === "rss" && success ? 1 : 0),
            failedRss: current.failedRss + (kind === "rss" && !success ? 1 : 0),
            averageResponseTimeMs,
            lastSearchAt: kind === "search" ? now : current.lastSearchAt,
            lastRssAt: kind === "rss" ? now : current.lastRssAt,
            updatedAt: now,
          })
          .where(eq(indexerStats.indexerId, indexerId))
      })

    const aggregateCapabilities = (protocol?: IndexerProtocol) =>
      Effect.gen(function* () {
        yield* seedBuiltInDefinitions()
        const query = db.select().from(indexerDefinitions)
        const rows = yield* protocol
          ? query.where(eq(indexerDefinitions.protocol, protocol))
          : query

        const searchTypes = new Set<string>()
        const categories = new Map<number, string>()

        for (const definition of rows) {
          for (const searchType of definition.capabilities.searchTypes) searchTypes.add(searchType)
          for (const category of definition.capabilities.categories) {
            categories.set(category.id, category.name)
          }
        }

        return {
          searchTypes: Array.from(searchTypes).toSorted(),
          categories: Array.from(categories.entries())
            .toSorted(([a], [b]) => a - b)
            .map(([id, name]) => ({ id, name })),
        } satisfies IndexerCapabilities
      })

    return {
      add: (input) =>
        Effect.gen(function* () {
          yield* registry.getIndexerFactory(input.type)
          const definitionKey = input.definitionKey ?? defaultDefinitionKey(input.type)
          yield* validateDefinitionKey(definitionKey)
          yield* validateProxyId(input.proxyId)
          const encrypted = yield* crypto.encrypt(input.apiKey)
          const inserted = yield* db
            .insert(indexers)
            .values({
              name: input.name,
              type: input.type,
              definitionKey,
              baseUrl: input.baseUrl,
              apiKeyEncrypted: encrypted,
              proxyId: input.proxyId ?? null,
              enabled: input.enabled ?? true,
              searchEnabled: input.searchEnabled ?? true,
              rssEnabled: input.rssEnabled ?? true,
              priority: input.priority ?? 50,
              categories: input.categories ?? [],
              tags: input.tags ?? [],
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
          yield* validateDefinitionKey(data.definitionKey)
          yield* validateProxyId(data.proxyId)
          const updateData: Record<string, unknown> = {}
          if (data.name !== undefined) updateData.name = data.name
          if (data.type !== undefined) updateData.type = data.type
          if (data.definitionKey !== undefined) updateData.definitionKey = data.definitionKey
          if (data.baseUrl !== undefined) updateData.baseUrl = data.baseUrl
          if (data.proxyId !== undefined) updateData.proxyId = data.proxyId
          if (data.enabled !== undefined) updateData.enabled = data.enabled
          if (data.searchEnabled !== undefined) updateData.searchEnabled = data.searchEnabled
          if (data.rssEnabled !== undefined) updateData.rssEnabled = data.rssEnabled
          if (data.priority !== undefined) updateData.priority = data.priority
          if (data.categories !== undefined) updateData.categories = data.categories
          if (data.tags !== undefined) updateData.tags = data.tags
          if (data.apiKey !== undefined) {
            updateData.apiKeyEncrypted = yield* crypto.encrypt(data.apiKey)
          }
          updateData.updatedAt = new Date()

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
              onSuccess: (caps) =>
                Effect.all([
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
                  db.update(indexers).set({ capabilities: caps }).where(eq(indexers.id, id)),
                ]),
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
            .where(and(eq(indexers.enabled, true), eq(indexers.searchEnabled, true)))
            .orderBy(indexers.priority)

          const eligibleRows = rows.filter((indexer) => {
            const protocol = lookupProtocol(indexer.type)
            return query.protocol === undefined || protocol === query.protocol
          })

          const results = yield* Effect.forEach(
            eligibleRows,
            (indexer) =>
              Effect.gen(function* () {
                const start = Date.now()
                return yield* Effect.gen(function* () {
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
                }).pipe(
                  Effect.tap(() =>
                    recordIndexerActivity(indexer.id, "search", true, Date.now() - start).pipe(
                      Effect.ignore,
                    ),
                  ),
                  Effect.tapError(() =>
                    recordIndexerActivity(indexer.id, "search", false, Date.now() - start).pipe(
                      Effect.ignore,
                    ),
                  ),
                )
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

      seedBuiltInDefinitions,

      listDefinitions: () =>
        Effect.gen(function* () {
          yield* seedBuiltInDefinitions()
          const rows = yield* db
            .select()
            .from(indexerDefinitions)
            .orderBy(indexerDefinitions.displayName)
          return rows.map(toDefinition)
        }),

      listStats: () =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({ stats: indexerStats, name: indexers.name })
            .from(indexerStats)
            .leftJoin(indexers, eq(indexerStats.indexerId, indexers.id))
            .orderBy(indexerStats.indexerId)
          return rows.map((row) => toStats(row.stats, row.name))
        }),

      aggregateCapabilities,

      addProxy: (input) =>
        Effect.gen(function* () {
          const encrypted =
            input.password && input.password.length > 0
              ? yield* crypto.encrypt(input.password)
              : null
          const rows = yield* db
            .insert(indexerProxies)
            .values({
              name: input.name,
              type: input.type,
              host: input.host,
              port: input.port ?? null,
              username: input.username ?? null,
              passwordEncrypted: encrypted,
              enabled: input.enabled ?? true,
              settings: input.settings ?? {},
            })
            .returning()
          return toProxy(rows[0])
        }),

      listProxies: () =>
        Effect.gen(function* () {
          const rows = yield* db.select().from(indexerProxies).orderBy(indexerProxies.name)
          return rows.map(toProxy)
        }),

      updateProxy: (id, data) =>
        Effect.gen(function* () {
          const updateData: Record<string, unknown> = {}
          if (data.name !== undefined) updateData.name = data.name
          if (data.type !== undefined) updateData.type = data.type
          if (data.host !== undefined) updateData.host = data.host
          if (data.port !== undefined) updateData.port = data.port
          if (data.username !== undefined) updateData.username = data.username
          if (data.enabled !== undefined) updateData.enabled = data.enabled
          if (data.settings !== undefined) updateData.settings = data.settings
          if (data.password !== undefined) {
            updateData.passwordEncrypted =
              data.password && data.password.length > 0
                ? yield* crypto.encrypt(data.password)
                : null
          }
          updateData.updatedAt = new Date()

          const rows = yield* db
            .update(indexerProxies)
            .set(updateData)
            .where(eq(indexerProxies.id, id))
            .returning()
          if (rows.length === 0) return yield* new NotFoundError({ entity: "indexer_proxy", id })
          return toProxy(rows[0])
        }),

      removeProxy: (id) =>
        Effect.gen(function* () {
          const rows = yield* db
            .delete(indexerProxies)
            .where(eq(indexerProxies.id, id))
            .returning({ id: indexerProxies.id })
          if (rows.length === 0) return yield* new NotFoundError({ entity: "indexer_proxy", id })
        }),

      listTypes: () => registry.listIndexerTypes(),
    }
  }),
)

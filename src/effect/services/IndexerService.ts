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
  IndexerConfigValues,
  IndexerConfig,
  IndexerDefinition,
  IndexerDefinitionSeed,
  IndexerDefinitionSyncAction,
  IndexerDefinitionSyncResult,
  IndexerOutboundProxy,
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
import { BUILT_IN_CARDIGANN_DEFINITIONS } from "./CardigannDefinitionLoader"
import { CryptoService } from "./CryptoService"
import { Db } from "./Db"

// ── Input types ──

interface IndexerInput {
  readonly name: string
  readonly type: IndexerType
  readonly definitionKey?: string | null
  readonly baseUrl: string
  readonly apiKey: string
  readonly configValues?: IndexerConfigValues
  readonly proxyId?: number | null
  readonly enabled?: boolean
  readonly searchEnabled?: boolean
  readonly rssEnabled?: boolean
  readonly priority?: number
  readonly minimumSeeders?: number | null
  readonly queryCooldownSeconds?: number | null
  readonly queryLimitCount?: number | null
  readonly queryLimitWindowSeconds?: number | null
  readonly grabLimitCount?: number | null
  readonly grabLimitWindowSeconds?: number | null
  readonly categories?: ReadonlyArray<number>
  readonly tags?: ReadonlyArray<string>
}

interface IndexerUpdate {
  readonly name?: string
  readonly type?: IndexerType
  readonly definitionKey?: string | null
  readonly baseUrl?: string
  readonly apiKey?: string
  readonly configValues?: IndexerConfigValues
  readonly proxyId?: number | null
  readonly enabled?: boolean
  readonly searchEnabled?: boolean
  readonly rssEnabled?: boolean
  readonly priority?: number
  readonly minimumSeeders?: number | null
  readonly queryCooldownSeconds?: number | null
  readonly queryLimitCount?: number | null
  readonly queryLimitWindowSeconds?: number | null
  readonly grabLimitCount?: number | null
  readonly grabLimitWindowSeconds?: number | null
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
    readonly canGrab: (indexerId: number) => Effect.Effect<boolean, SqlError>
    readonly recordGrab: (indexerId: number) => Effect.Effect<void, NotFoundError | SqlError>
    readonly seedBuiltInDefinitions: () => Effect.Effect<void, SqlError>
    readonly refreshDefinitions: () => Effect.Effect<IndexerDefinitionSyncResult, SqlError>
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

const GENERIC_INDEXER_DEFINITIONS: ReadonlyArray<IndexerDefinitionSeed> = [
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

const BUILT_IN_DEFINITIONS: ReadonlyArray<IndexerDefinitionSeed> = [
  ...GENERIC_INDEXER_DEFINITIONS,
  ...BUILT_IN_CARDIGANN_DEFINITIONS,
]

const INDEXER_BACKOFF_MS: Record<IndexerError["reason"], number> = {
  auth_failed: 0,
  connection_failed: 60_000,
  invalid_response: 60_000,
  rate_limited: 5 * 60_000,
  search_timeout: 60_000,
}

function defaultDefinitionKey(type: string): string | null {
  if (type === "torznab") return "generic-torznab"
  if (type === "newznab") return "generic-newznab"
  return null
}

function requiresDefinitionKey(type: string): boolean {
  return type === "cardigann_yaml"
}

function normalizeConfigValues(values: IndexerConfigValues | undefined): Record<string, string> {
  if (!values) return {}

  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    const normalizedKey = key.trim()
    if (normalizedKey.length > 0) {
      normalized[normalizedKey] = value
    }
  }
  return normalized
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
    minimumSeeders: row.minimumSeeders,
    queryCooldownSeconds: row.queryCooldownSeconds,
    queryLimitCount: row.queryLimitCount,
    queryLimitWindowSeconds: row.queryLimitWindowSeconds,
    grabLimitCount: row.grabLimitCount,
    grabLimitWindowSeconds: row.grabLimitWindowSeconds,
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
    sourceYaml: row.sourceYaml,
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
    totalGrabs: row.totalGrabs,
    averageResponseTimeMs: row.averageResponseTimeMs,
    lastSearchAt: row.lastSearchAt,
    lastRssAt: row.lastRssAt,
    lastGrabAt: row.lastGrabAt,
    queryLimitWindowStartedAt: row.queryLimitWindowStartedAt,
    queryLimitWindowSearches: row.queryLimitWindowSearches,
    grabLimitWindowStartedAt: row.grabLimitWindowStartedAt,
    grabLimitWindowGrabs: row.grabLimitWindowGrabs,
  }
}

function healthReason(message: string | null): IndexerError["reason"] | null {
  const prefix = message?.split(":", 1)[0]
  if (
    prefix === "auth_failed" ||
    prefix === "connection_failed" ||
    prefix === "invalid_response" ||
    prefix === "rate_limited" ||
    prefix === "search_timeout"
  ) {
    return prefix
  }
  return null
}

function isBackoffActive(health: typeof indexerHealth.$inferSelect | null): boolean {
  if (!health || health.status !== "unhealthy") return false
  const reason = healthReason(health.errorMessage)
  const backoffMs = reason ? INDEXER_BACKOFF_MS[reason] : 60_000
  if (backoffMs <= 0) return false
  return Date.now() - health.lastCheck.getTime() < backoffMs
}

function isQueryCooldownActive(
  indexer: typeof indexers.$inferSelect,
  stats: typeof indexerStats.$inferSelect | null,
): boolean {
  if (!indexer.queryCooldownSeconds || indexer.queryCooldownSeconds <= 0) return false
  if (!stats?.lastSearchAt) return false
  return Date.now() - stats.lastSearchAt.getTime() < indexer.queryCooldownSeconds * 1000
}

function isQueryLimitActive(
  indexer: typeof indexers.$inferSelect,
  stats: typeof indexerStats.$inferSelect | null,
): boolean {
  if (
    indexer.queryLimitCount === null ||
    indexer.queryLimitWindowSeconds === null ||
    indexer.queryLimitCount <= 0 ||
    indexer.queryLimitWindowSeconds <= 0
  ) {
    return false
  }
  if (!stats?.queryLimitWindowStartedAt) return false
  const elapsedMs = Date.now() - stats.queryLimitWindowStartedAt.getTime()
  if (elapsedMs >= indexer.queryLimitWindowSeconds * 1000) return false
  return stats.queryLimitWindowSearches >= indexer.queryLimitCount
}

function isGrabLimitActive(
  indexer: typeof indexers.$inferSelect,
  stats: typeof indexerStats.$inferSelect | null,
): boolean {
  if (
    indexer.grabLimitCount === null ||
    indexer.grabLimitWindowSeconds === null ||
    indexer.grabLimitCount <= 0 ||
    indexer.grabLimitWindowSeconds <= 0
  ) {
    return false
  }
  if (!stats?.grabLimitWindowStartedAt) return false
  const elapsedMs = Date.now() - stats.grabLimitWindowStartedAt.getTime()
  if (elapsedMs >= indexer.grabLimitWindowSeconds * 1000) return false
  return stats.grabLimitWindowGrabs >= indexer.grabLimitCount
}

function nextQueryLimitWindow(
  indexer: typeof indexers.$inferSelect,
  current: typeof indexerStats.$inferSelect | null,
  now: Date,
): Pick<
  typeof indexerStats.$inferInsert,
  "queryLimitWindowStartedAt" | "queryLimitWindowSearches"
> {
  if (
    indexer.queryLimitCount === null ||
    indexer.queryLimitWindowSeconds === null ||
    indexer.queryLimitCount <= 0 ||
    indexer.queryLimitWindowSeconds <= 0
  ) {
    return { queryLimitWindowStartedAt: null, queryLimitWindowSearches: 0 }
  }

  const startedAt = current?.queryLimitWindowStartedAt ?? null
  const expired =
    startedAt === null ||
    now.getTime() - startedAt.getTime() >= indexer.queryLimitWindowSeconds * 1000

  return {
    queryLimitWindowStartedAt: expired ? now : startedAt,
    queryLimitWindowSearches: (expired ? 0 : (current?.queryLimitWindowSearches ?? 0)) + 1,
  }
}

function nextGrabLimitWindow(
  indexer: typeof indexers.$inferSelect,
  current: typeof indexerStats.$inferSelect | null,
  now: Date,
): Pick<typeof indexerStats.$inferInsert, "grabLimitWindowStartedAt" | "grabLimitWindowGrabs"> {
  if (
    indexer.grabLimitCount === null ||
    indexer.grabLimitWindowSeconds === null ||
    indexer.grabLimitCount <= 0 ||
    indexer.grabLimitWindowSeconds <= 0
  ) {
    return { grabLimitWindowStartedAt: null, grabLimitWindowGrabs: 0 }
  }

  const startedAt = current?.grabLimitWindowStartedAt ?? null
  const expired =
    startedAt === null ||
    now.getTime() - startedAt.getTime() >= indexer.grabLimitWindowSeconds * 1000

  return {
    grabLimitWindowStartedAt: expired ? now : startedAt,
    grabLimitWindowGrabs: (expired ? 0 : (current?.grabLimitWindowGrabs ?? 0)) + 1,
  }
}

function releasePassesIndexerPolicy(
  indexer: typeof indexers.$inferSelect,
  release: ReleaseCandidate,
): boolean {
  if (release.protocol !== "torrent") return true
  if (indexer.minimumSeeders === null || indexer.minimumSeeders <= 0) return true
  return (release.seeders ?? -1) >= indexer.minimumSeeders
}

function searchQueryForIndexer(
  indexer: typeof indexers.$inferSelect,
  query: SearchQuery,
): SearchQuery | null {
  if (indexer.categories.length === 0) return query

  if (query.categories && query.categories.length > 0) {
    const allowed = query.categories.filter((category) => indexer.categories.includes(category))
    return allowed.length > 0 ? { ...query, categories: allowed } : null
  }

  return { ...query, categories: indexer.categories }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function definitionChanged(
  row: typeof indexerDefinitions.$inferSelect,
  definition: IndexerDefinitionSeed,
): boolean {
  return (
    row.displayName !== definition.displayName ||
    row.protocol !== definition.protocol ||
    row.implementation !== definition.implementation ||
    row.baseUrl !== definition.baseUrl ||
    row.privacy !== definition.privacy ||
    row.supportsRss !== definition.supportsRss ||
    row.supportsSearch !== definition.supportsSearch ||
    !sameJson(row.authFields, definition.authFields) ||
    !sameJson(row.categories, definition.categories) ||
    !sameJson(row.capabilities, definition.capabilities) ||
    !sameJson(row.tags, definition.tags) ||
    row.version !== definition.version ||
    (row.sourceYaml ?? null) !== (definition.sourceYaml ?? null)
  )
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

    const encryptConfigValues = (values: IndexerConfigValues | undefined) =>
      Effect.gen(function* () {
        const encrypted: Record<string, string> = {}
        for (const [key, value] of Object.entries(normalizeConfigValues(values))) {
          encrypted[key] = yield* crypto.encrypt(value)
        }
        return encrypted
      })

    const decryptConfigValues = (values: IndexerConfigValues) =>
      Effect.gen(function* () {
        const decrypted: Record<string, string> = {}
        for (const [key, value] of Object.entries(values)) {
          decrypted[key] = yield* crypto.decrypt(value)
        }
        return decrypted
      })

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

    const upsertDefinition = (definition: IndexerDefinitionSeed, now: Date) =>
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
            sourceYaml: definition.sourceYaml ?? null,
            updatedAt: now,
          },
        })

    const refreshDefinitions = () =>
      Effect.gen(function* () {
        const now = new Date()
        const existingRows = yield* db.select().from(indexerDefinitions)
        const existingByKey = new Map(
          existingRows.map((definition) => [definition.definitionKey, definition] as const),
        )

        const definitions = []

        for (const definition of BUILT_IN_DEFINITIONS) {
          const existing = existingByKey.get(definition.definitionKey)
          const action: IndexerDefinitionSyncAction =
            existing === undefined
              ? "created"
              : definitionChanged(existing, definition)
                ? "updated"
                : "unchanged"

          if (action !== "unchanged") {
            yield* upsertDefinition(definition, now)
          }

          definitions.push({
            definitionKey: definition.definitionKey,
            displayName: definition.displayName,
            previousVersion: existing?.version ?? null,
            version: definition.version,
            action,
          })
        }

        return {
          total: definitions.length,
          created: definitions.filter((definition) => definition.action === "created").length,
          updated: definitions.filter((definition) => definition.action === "updated").length,
          unchanged: definitions.filter((definition) => definition.action === "unchanged").length,
          refreshedAt: now,
          definitions,
        } satisfies IndexerDefinitionSyncResult
      })

    const seedBuiltInDefinitions = () => refreshDefinitions().pipe(Effect.asVoid)

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

    const validateDefinitionSelection = (type: string, definitionKey: string | null | undefined) =>
      Effect.gen(function* () {
        if (requiresDefinitionKey(type) && !definitionKey) {
          return yield* new ValidationError({
            message: `${type} indexers require a definition key`,
          })
        }
        yield* validateDefinitionKey(definitionKey)
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

    const resolveOutboundProxy = (
      proxyId: number | null,
    ): Effect.Effect<IndexerOutboundProxy | null, EncryptionError | SqlError> =>
      Effect.gen(function* () {
        if (proxyId === null) return null

        const rows = yield* db.select().from(indexerProxies).where(eq(indexerProxies.id, proxyId))
        const proxy = rows[0]
        if (!proxy || !proxy.enabled) return null

        const password =
          proxy.passwordEncrypted && proxy.passwordEncrypted.length > 0
            ? yield* crypto.decrypt(proxy.passwordEncrypted)
            : null

        return {
          type: proxy.type,
          host: proxy.host,
          port: proxy.port,
          username: proxy.username,
          password,
          settings: proxy.settings,
        }
      })

    const loadDefinitionYaml = (definitionKey: string | null) =>
      Effect.gen(function* () {
        if (definitionKey === null) return null
        const rows = yield* db
          .select({ sourceYaml: indexerDefinitions.sourceYaml })
          .from(indexerDefinitions)
          .where(eq(indexerDefinitions.definitionKey, definitionKey))
        return rows[0]?.sourceYaml ?? null
      })

    const recordIndexerActivity = (
      indexer: typeof indexers.$inferSelect,
      kind: "search" | "rss",
      success: boolean,
      responseTimeMs: number,
    ) =>
      Effect.gen(function* () {
        const now = new Date()
        const indexerId = indexer.id
        const rows = yield* db
          .select()
          .from(indexerStats)
          .where(eq(indexerStats.indexerId, indexerId))
        const current = rows[0]
        const queryLimitWindow =
          kind === "search" ? nextQueryLimitWindow(indexer, current ?? null, now) : {}

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
            ...queryLimitWindow,
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
            ...queryLimitWindow,
            updatedAt: now,
          })
          .where(eq(indexerStats.indexerId, indexerId))
      })

    const recordIndexerGrab = (indexerId: number) =>
      Effect.gen(function* () {
        const now = new Date()
        const rows = yield* db
          .select({ indexer: indexers, stats: indexerStats })
          .from(indexers)
          .leftJoin(indexerStats, eq(indexers.id, indexerStats.indexerId))
          .where(eq(indexers.id, indexerId))
        const row = rows[0]
        if (!row) return yield* new NotFoundError({ entity: "indexer", id: indexerId })

        const grabLimitWindow = nextGrabLimitWindow(row.indexer, row.stats ?? null, now)

        if (!row.stats) {
          yield* db.insert(indexerStats).values({
            indexerId,
            totalGrabs: 1,
            lastGrabAt: now,
            ...grabLimitWindow,
          })
          return
        }

        yield* db
          .update(indexerStats)
          .set({
            totalGrabs: row.stats.totalGrabs + 1,
            lastGrabAt: now,
            ...grabLimitWindow,
            updatedAt: now,
          })
          .where(eq(indexerStats.indexerId, indexerId))
      })

    const markIndexerSearchHealthy = (indexerId: number, responseTimeMs: number) =>
      db
        .insert(indexerHealth)
        .values({
          indexerId,
          status: "healthy",
          errorMessage: null,
          responseTimeMs,
          lastCheck: new Date(),
        })
        .onConflictDoUpdate({
          target: indexerHealth.indexerId,
          set: {
            status: "healthy",
            errorMessage: null,
            responseTimeMs,
            lastCheck: new Date(),
          },
        })

    const markIndexerSearchUnhealthy = (
      indexerId: number,
      err: IndexerError,
      responseTimeMs: number,
    ) =>
      Effect.gen(function* () {
        yield* db
          .insert(indexerHealth)
          .values({
            indexerId,
            status: "unhealthy",
            errorMessage: `${err.reason}: ${err.message}`,
            responseTimeMs,
            lastCheck: new Date(),
          })
          .onConflictDoUpdate({
            target: indexerHealth.indexerId,
            set: {
              status: "unhealthy",
              errorMessage: `${err.reason}: ${err.message}`,
              responseTimeMs,
              lastCheck: new Date(),
            },
          })

        if (err.reason === "auth_failed") {
          yield* db
            .update(indexers)
            .set({ enabled: false, updatedAt: new Date() })
            .where(eq(indexers.id, indexerId))
        }
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
          yield* validateDefinitionSelection(input.type, definitionKey)
          yield* validateProxyId(input.proxyId)
          const encrypted = yield* crypto.encrypt(input.apiKey)
          const configValuesEncrypted = yield* encryptConfigValues(input.configValues)
          const inserted = yield* db
            .insert(indexers)
            .values({
              name: input.name,
              type: input.type,
              definitionKey,
              baseUrl: input.baseUrl,
              apiKeyEncrypted: encrypted,
              configValuesEncrypted,
              proxyId: input.proxyId ?? null,
              enabled: input.enabled ?? true,
              searchEnabled: input.searchEnabled ?? true,
              rssEnabled: input.rssEnabled ?? true,
              priority: input.priority ?? 50,
              minimumSeeders: input.minimumSeeders ?? null,
              queryCooldownSeconds: input.queryCooldownSeconds ?? null,
              queryLimitCount: input.queryLimitCount ?? null,
              queryLimitWindowSeconds: input.queryLimitWindowSeconds ?? null,
              grabLimitCount: input.grabLimitCount ?? null,
              grabLimitWindowSeconds: input.grabLimitWindowSeconds ?? null,
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
          if (data.type !== undefined || data.definitionKey !== undefined) {
            const existing = yield* db
              .select({ type: indexers.type, definitionKey: indexers.definitionKey })
              .from(indexers)
              .where(eq(indexers.id, id))
            const current = existing[0]
            if (!current) return yield* new NotFoundError({ entity: "indexer", id })
            yield* validateDefinitionSelection(
              data.type ?? current.type,
              data.definitionKey !== undefined ? data.definitionKey : current.definitionKey,
            )
          }
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
          if (data.minimumSeeders !== undefined) updateData.minimumSeeders = data.minimumSeeders
          if (data.queryCooldownSeconds !== undefined) {
            updateData.queryCooldownSeconds = data.queryCooldownSeconds
          }
          if (data.queryLimitCount !== undefined) updateData.queryLimitCount = data.queryLimitCount
          if (data.queryLimitWindowSeconds !== undefined) {
            updateData.queryLimitWindowSeconds = data.queryLimitWindowSeconds
          }
          if (data.grabLimitCount !== undefined) updateData.grabLimitCount = data.grabLimitCount
          if (data.grabLimitWindowSeconds !== undefined) {
            updateData.grabLimitWindowSeconds = data.grabLimitWindowSeconds
          }
          if (data.categories !== undefined) updateData.categories = data.categories
          if (data.tags !== undefined) updateData.tags = data.tags
          if (data.apiKey !== undefined) {
            updateData.apiKeyEncrypted = yield* crypto.encrypt(data.apiKey)
          }
          if (data.configValues !== undefined) {
            const existing = yield* db
              .select({ configValuesEncrypted: indexers.configValuesEncrypted })
              .from(indexers)
              .where(eq(indexers.id, id))
            const current = existing[0]
            if (!current) return yield* new NotFoundError({ entity: "indexer", id })
            updateData.configValuesEncrypted = {
              ...current.configValuesEncrypted,
              ...(yield* encryptConfigValues(data.configValues)),
            }
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
          const configValues = yield* decryptConfigValues(indexer.configValuesEncrypted)
          const proxy = yield* resolveOutboundProxy(indexer.proxyId)
          const definitionYaml = yield* loadDefinitionYaml(indexer.definitionKey)
          const factory = yield* registry.getIndexerFactory(indexer.type)
          const config: IndexerConfig = {
            id: indexer.id,
            name: indexer.name,
            type: indexer.type,
            definitionKey: indexer.definitionKey,
            definitionYaml,
            baseUrl: indexer.baseUrl,
            apiKey,
            configValues,
            priority: indexer.priority,
            categories: indexer.categories,
            protocol: lookupProtocol(indexer.type),
            proxy,
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
            .select({ indexer: indexers, health: indexerHealth, stats: indexerStats })
            .from(indexers)
            .leftJoin(indexerHealth, eq(indexers.id, indexerHealth.indexerId))
            .leftJoin(indexerStats, eq(indexers.id, indexerStats.indexerId))
            .where(and(eq(indexers.enabled, true), eq(indexers.searchEnabled, true)))
            .orderBy(indexers.priority)

          const eligibleRows = rows.filter((row) => {
            const protocol = lookupProtocol(row.indexer.type)
            return query.protocol === undefined || protocol === query.protocol
          })

          const results = yield* Effect.forEach(
            eligibleRows.filter(
              (row) =>
                searchQueryForIndexer(row.indexer, query) !== null &&
                !isBackoffActive(row.health) &&
                !isQueryCooldownActive(row.indexer, row.stats) &&
                !isQueryLimitActive(row.indexer, row.stats),
            ),
            (row) =>
              Effect.gen(function* () {
                const indexer = row.indexer
                const start = Date.now()
                return yield* Effect.gen(function* () {
                  const apiKey = yield* crypto.decrypt(indexer.apiKeyEncrypted)
                  const configValues = yield* decryptConfigValues(indexer.configValuesEncrypted)
                  const proxy = yield* resolveOutboundProxy(indexer.proxyId)
                  const definitionYaml = yield* loadDefinitionYaml(indexer.definitionKey)
                  const factory = yield* registry.getIndexerFactory(indexer.type)
                  const indexerQuery = searchQueryForIndexer(indexer, query)
                  if (indexerQuery === null) return []
                  const config: IndexerConfig = {
                    id: indexer.id,
                    name: indexer.name,
                    type: indexer.type,
                    definitionKey: indexer.definitionKey,
                    definitionYaml,
                    baseUrl: indexer.baseUrl,
                    apiKey,
                    configValues,
                    priority: indexer.priority,
                    categories: indexer.categories,
                    protocol: lookupProtocol(indexer.type),
                    proxy,
                  }
                  const adapter = factory(config)
                  const releases = yield* adapter.search(indexerQuery)
                  return releases.filter((release) => releasePassesIndexerPolicy(indexer, release))
                }).pipe(
                  Effect.tap(() =>
                    Effect.all([
                      recordIndexerActivity(indexer, "search", true, Date.now() - start),
                      markIndexerSearchHealthy(indexer.id, Date.now() - start),
                    ]).pipe(Effect.ignore),
                  ),
                  Effect.tapError((err) =>
                    Effect.gen(function* () {
                      yield* recordIndexerActivity(indexer, "search", false, Date.now() - start)
                      if (err._tag === "IndexerError") {
                        yield* markIndexerSearchUnhealthy(indexer.id, err, Date.now() - start)
                      }
                    }).pipe(Effect.ignore),
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

      canGrab: (indexerId) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({ indexer: indexers, stats: indexerStats })
            .from(indexers)
            .leftJoin(indexerStats, eq(indexers.id, indexerStats.indexerId))
            .where(eq(indexers.id, indexerId))
          const row = rows[0]
          if (!row || !row.indexer.enabled) return false
          return !isGrabLimitActive(row.indexer, row.stats ?? null)
        }),

      recordGrab: recordIndexerGrab,

      seedBuiltInDefinitions,

      refreshDefinitions,

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

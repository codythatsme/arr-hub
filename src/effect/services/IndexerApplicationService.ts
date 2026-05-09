import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { z } from "zod"

import {
  indexerApplicationMappings,
  indexerApplications,
  indexerDefinitions,
  indexers,
} from "#/db/schema"

import type { IndexerProtocol } from "../domain/indexer"
import type {
  IndexerApplication,
  IndexerApplicationMapping,
  IndexerApplicationSettings,
  IndexerApplicationSyncFailure,
  IndexerApplicationSyncItem,
  IndexerApplicationSyncLevel,
  IndexerApplicationSyncResult,
  IndexerApplicationSyncSummary,
  IndexerApplicationType,
} from "../domain/indexerApplication"
import { IndexerApplicationError, NotFoundError, type EncryptionError } from "../errors"
import { CryptoService } from "./CryptoService"
import { Db } from "./Db"
import { IndexerService } from "./IndexerService"

// ── Input types ──

interface IndexerApplicationInput {
  readonly name: string
  readonly type: IndexerApplicationType
  readonly baseUrl: string
  readonly apiKey: string
  readonly syncBaseUrl: string
  readonly syncApiKey: string
  readonly enabled?: boolean
  readonly settings?: IndexerApplicationSettings
}

interface IndexerApplicationUpdate {
  readonly name?: string
  readonly type?: IndexerApplicationType
  readonly baseUrl?: string
  readonly apiKey?: string
  readonly syncBaseUrl?: string
  readonly syncApiKey?: string
  readonly enabled?: boolean
  readonly settings?: IndexerApplicationSettings
}

// ── Service tag ──

export class IndexerApplicationService extends Context.Tag("@arr-hub/IndexerApplicationService")<
  IndexerApplicationService,
  {
    readonly add: (
      input: IndexerApplicationInput,
    ) => Effect.Effect<IndexerApplication, EncryptionError | SqlError>
    readonly list: () => Effect.Effect<ReadonlyArray<IndexerApplication>, SqlError>
    readonly getById: (id: number) => Effect.Effect<IndexerApplication, NotFoundError | SqlError>
    readonly update: (
      id: number,
      data: IndexerApplicationUpdate,
    ) => Effect.Effect<IndexerApplication, NotFoundError | EncryptionError | SqlError>
    readonly remove: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
    readonly sync: (
      id: number,
    ) => Effect.Effect<
      IndexerApplicationSyncResult,
      NotFoundError | IndexerApplicationError | EncryptionError | SqlError
    >
    readonly syncEnabled: () => Effect.Effect<IndexerApplicationSyncSummary, SqlError>
  }
>() {}

// ── Remote application client ──

const TIMEOUT_MS = 30_000

class RemoteApplicationHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const RemoteFieldSchema = z
  .object({
    name: z.string(),
    value: z.unknown().optional(),
  })
  .passthrough()

const RemoteIndexerSchema = z
  .object({
    id: z.number().default(0),
    name: z.string().default(""),
    implementation: z.string().default(""),
    configContract: z.string().optional(),
    fields: z.array(RemoteFieldSchema).default([]),
  })
  .passthrough()

const RemoteIndexerListSchema = z.array(RemoteIndexerSchema)

type RemoteField = z.infer<typeof RemoteFieldSchema>
type RemoteIndexer = z.infer<typeof RemoteIndexerSchema>

async function fetchRemoteJson(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit = {},
  params: Record<string, string> = {},
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const url = new URL(`${baseUrl.replace(/\/+$/, "")}${path}`)
    url.searchParams.set("apikey", apiKey)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    const headers = new Headers(init.headers)
    headers.set("X-Api-Key", apiKey)
    if (init.body !== undefined) headers.set("Content-Type", "application/json")

    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers,
    })

    if (!res.ok) {
      const message = await res.text().catch(() => res.statusText)
      throw new RemoteApplicationHttpError(res.status, message || res.statusText)
    }

    if (res.status === 204) return null
    return (await res.json()) as unknown
  } finally {
    clearTimeout(timer)
  }
}

async function fetchRemoteIndexers(baseUrl: string, apiKey: string) {
  const raw = await fetchRemoteJson(baseUrl, apiKey, "/api/v3/indexer")
  return RemoteIndexerListSchema.parse(raw)
}

async function fetchRemoteIndexerSchema(baseUrl: string, apiKey: string) {
  const raw = await fetchRemoteJson(baseUrl, apiKey, "/api/v3/indexer/schema")
  return RemoteIndexerListSchema.parse(raw)
}

async function createRemoteIndexer(baseUrl: string, apiKey: string, payload: RemoteIndexer) {
  const raw = await fetchRemoteJson(baseUrl, apiKey, "/api/v3/indexer", {
    method: "POST",
    body: JSON.stringify(payload),
  })
  return RemoteIndexerSchema.parse(raw)
}

async function updateRemoteIndexer(baseUrl: string, apiKey: string, payload: RemoteIndexer) {
  const raw = await fetchRemoteJson(baseUrl, apiKey, `/api/v3/indexer/${payload.id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  })
  return RemoteIndexerSchema.parse(raw)
}

async function deleteRemoteIndexer(baseUrl: string, apiKey: string, remoteId: number) {
  try {
    await fetchRemoteJson(baseUrl, apiKey, `/api/v3/indexer/${remoteId}`, { method: "DELETE" })
  } catch (error) {
    if (error instanceof RemoteApplicationHttpError && error.status === 404) return
    throw error
  }
}

async function createOrUpdateRemoteIndexer(
  baseUrl: string,
  apiKey: string,
  payload: RemoteIndexer,
  existingRemoteId: number | null,
) {
  const save = () =>
    existingRemoteId === null
      ? createRemoteIndexer(baseUrl, apiKey, payload)
      : updateRemoteIndexer(baseUrl, apiKey, { ...payload, id: existingRemoteId })

  try {
    return await save()
  } catch (error) {
    if (!(error instanceof RemoteApplicationHttpError) || error.status !== 400) throw error
    const raw = await fetchRemoteJson(
      baseUrl,
      apiKey,
      existingRemoteId === null ? "/api/v3/indexer" : `/api/v3/indexer/${existingRemoteId}`,
      {
        method: existingRemoteId === null ? "POST" : "PUT",
        body: JSON.stringify(
          existingRemoteId === null ? payload : { ...payload, id: existingRemoteId },
        ),
      },
      { forceSave: "true" },
    )
    return RemoteIndexerSchema.parse(raw)
  }
}

function toApplicationError(
  application: typeof indexerApplications.$inferSelect,
  error: unknown,
): IndexerApplicationError {
  if (error instanceof z.ZodError) {
    return new IndexerApplicationError({
      applicationId: application.id,
      applicationName: application.name,
      reason: "invalid_response",
      message: `schema validation failed: ${error.issues.map((i) => i.message).join(", ")}`,
      retryable: false,
    })
  }

  if (error instanceof RemoteApplicationHttpError) {
    return new IndexerApplicationError({
      applicationId: application.id,
      applicationName: application.name,
      reason: error.status === 401 ? "auth_failed" : "sync_failed",
      message: `HTTP ${error.status}: ${error.message}`,
      retryable: error.status !== 401 && error.status >= 500,
    })
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new IndexerApplicationError({
      applicationId: application.id,
      applicationName: application.name,
      reason: "connection_failed",
      message: "request timed out",
      retryable: true,
    })
  }

  const message = error instanceof Error ? error.message : "unknown error"
  return new IndexerApplicationError({
    applicationId: application.id,
    applicationName: application.name,
    reason: /fetch|network|ECONN|ENOTFOUND/i.test(message) ? "connection_failed" : "sync_failed",
    message,
    retryable: true,
  })
}

function toSyncFailure(
  application: typeof indexerApplications.$inferSelect,
  error: unknown,
): IndexerApplicationSyncFailure {
  if (
    error instanceof IndexerApplicationError ||
    (typeof error === "object" &&
      error !== null &&
      "_tag" in error &&
      error._tag === "IndexerApplicationError")
  ) {
    const appError = error as IndexerApplicationError
    return {
      applicationId: appError.applicationId,
      applicationName: appError.applicationName,
      message: appError.message,
      reason: appError.reason,
      retryable: appError.retryable,
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  return {
    applicationId: application.id,
    applicationName: application.name,
    message,
    reason: "sync_failed",
    retryable: true,
  }
}

// ── Helpers ──

const DEFAULT_SYNC_LEVEL: IndexerApplicationSyncLevel = "full"

const DEFAULT_APP_CATEGORIES: Record<IndexerApplicationType, ReadonlyArray<number>> = {
  radarr: [2000],
  sonarr: [5000],
}

const PROTOCOL_ORDER: ReadonlyArray<IndexerProtocol> = ["torrent", "usenet"]

const MANAGED_REMOTE_FIELD_NAMES = new Set([
  "baseUrl",
  "apiPath",
  "apiKey",
  "categories",
  "animeCategories",
  "minimumSeeders",
  "seedCriteria.seedRatio",
  "seedCriteria.seedTime",
  "seedCriteria.seasonPackSeedTime",
  "rejectBlocklistedTorrentHashesWhileGrabbing",
])

function normalizeSettings(
  settings: IndexerApplicationSettings,
): Required<IndexerApplicationSettings> {
  return {
    syncCategories: settings.syncCategories ?? [],
    syncLevel: settings.syncLevel ?? DEFAULT_SYNC_LEVEL,
    enableRss: settings.enableRss ?? true,
    enableAutomaticSearch: settings.enableAutomaticSearch ?? true,
    enableInteractiveSearch: settings.enableInteractiveSearch ?? true,
    priority: settings.priority ?? 25,
    minimumSeeders: settings.minimumSeeders ?? 0,
    seedRatio: settings.seedRatio ?? null,
    seedTimeMinutes: settings.seedTimeMinutes ?? null,
    seasonPackSeedTimeMinutes: settings.seasonPackSeedTimeMinutes ?? null,
    rejectBlocklistedTorrentHashesWhileGrabbing:
      settings.rejectBlocklistedTorrentHashesWhileGrabbing ?? false,
  }
}

function protocolPath(protocol: IndexerProtocol): "torznab" | "newznab" {
  return protocol === "torrent" ? "torznab" : "newznab"
}

function implementationName(protocol: IndexerProtocol): "Torznab" | "Newznab" {
  return protocol === "torrent" ? "Torznab" : "Newznab"
}

function aggregateBaseUrl(syncBaseUrl: string, protocol: IndexerProtocol): string {
  return `${syncBaseUrl.replace(/\/+$/, "")}/api/indexers/aggregate/${protocolPath(protocol)}`
}

function rootCategory(category: number): number {
  return Math.floor(category / 1000) * 1000
}

function filteredCategories(
  applicationType: IndexerApplicationType,
  settings: Required<IndexerApplicationSettings>,
  categories: ReadonlyArray<number>,
): ReadonlyArray<number> {
  const requested =
    settings.syncCategories.length > 0
      ? settings.syncCategories
      : DEFAULT_APP_CATEGORIES[applicationType]
  return categories
    .filter((category) =>
      requested.some((candidate) => candidate === category || candidate === rootCategory(category)),
    )
    .toSorted((a, b) => a - b)
}

function toMapping(row: typeof indexerApplicationMappings.$inferSelect): IndexerApplicationMapping {
  return {
    id: row.id,
    applicationId: row.applicationId,
    protocol: row.protocol,
    remoteIndexerId: row.remoteIndexerId,
    remoteIndexerName: row.remoteIndexerName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toApplication(
  row: typeof indexerApplications.$inferSelect,
  mappingRows: ReadonlyArray<typeof indexerApplicationMappings.$inferSelect>,
): IndexerApplication {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    baseUrl: row.baseUrl,
    syncBaseUrl: row.syncBaseUrl,
    enabled: row.enabled,
    settings: row.settings,
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    mappings: mappingRows.map(toMapping),
  }
}

function protocolForIndexer(
  row: typeof indexers.$inferSelect,
  definition: typeof indexerDefinitions.$inferSelect | null,
): IndexerProtocol {
  if (definition) return definition.protocol
  return row.type === "newznab" ? "usenet" : "torrent"
}

function categoryIdsForIndexer(
  row: typeof indexers.$inferSelect,
  definition: typeof indexerDefinitions.$inferSelect | null,
): ReadonlyArray<number> {
  if (row.categories.length > 0) return row.categories
  const categories = row.capabilities?.categories ?? definition?.capabilities.categories ?? []
  return categories.map((category) => category.id)
}

function remoteFieldValue(indexer: RemoteIndexer, name: string): unknown {
  return indexer.fields.find((field) => field.name === name)?.value
}

function cloneSchemaFields(schema: RemoteIndexer | undefined): Array<RemoteField> {
  const fields: Array<RemoteField> = []
  for (const field of schema?.fields ?? []) {
    fields.push(Object.assign({}, field))
  }
  return fields
}

function preserveRemoteUserFields(
  fields: Array<RemoteField>,
  existingRemote: RemoteIndexer | undefined,
): void {
  for (const field of existingRemote?.fields ?? []) {
    if (MANAGED_REMOTE_FIELD_NAMES.has(field.name)) continue
    const existingIndex = fields.findIndex((candidate) => candidate.name === field.name)
    const preserved = Object.assign({}, field)
    if (existingIndex >= 0) {
      fields[existingIndex] = preserved
    } else {
      fields.push(preserved)
    }
  }
}

function setField(fields: Array<RemoteField>, name: string, value: unknown): void {
  const existing = fields.find((field) => field.name === name)
  if (existing) {
    existing.value = value
    return
  }
  fields.push({ name, value })
}

function remoteArrayProperty(indexer: RemoteIndexer | undefined, name: string): Array<unknown> {
  const value = indexer === undefined ? undefined : (indexer as Record<string, unknown>)[name]
  return Array.isArray(value) ? [...value] : []
}

function remoteProperty(indexer: RemoteIndexer | undefined, name: string): unknown {
  return indexer === undefined ? undefined : (indexer as Record<string, unknown>)[name]
}

function buildRemoteIndexerPayload(input: {
  readonly application: typeof indexerApplications.$inferSelect
  readonly settings: Required<IndexerApplicationSettings>
  readonly protocol: IndexerProtocol
  readonly categories: ReadonlyArray<number>
  readonly schema: RemoteIndexer | undefined
  readonly syncApiKey: string
  readonly remoteId: number | null
  readonly existingRemote?: RemoteIndexer
}): RemoteIndexer {
  const implementation = implementationName(input.protocol)
  const fields = cloneSchemaFields(input.schema)
  preserveRemoteUserFields(fields, input.existingRemote)
  setField(fields, "baseUrl", aggregateBaseUrl(input.application.syncBaseUrl, input.protocol))
  setField(fields, "apiPath", "/api")
  setField(fields, "apiKey", input.syncApiKey)
  setField(fields, "categories", input.categories)

  if (input.application.type === "sonarr") {
    setField(fields, "animeCategories", input.categories)
  }

  if (input.protocol === "torrent") {
    setField(fields, "minimumSeeders", input.settings.minimumSeeders)
    setField(fields, "seedCriteria.seedRatio", input.settings.seedRatio)
    setField(fields, "seedCriteria.seedTime", input.settings.seedTimeMinutes)
    setField(fields, "seedCriteria.seasonPackSeedTime", input.settings.seasonPackSeedTimeMinutes)
    setField(
      fields,
      "rejectBlocklistedTorrentHashesWhileGrabbing",
      input.settings.rejectBlocklistedTorrentHashesWhileGrabbing,
    )
  }

  const payload = {
    id: input.remoteId ?? 0,
    name: `ARR Hub ${implementation} (Aggregate)`,
    implementation,
    configContract: input.schema?.configContract ?? `${implementation}Settings`,
    enableRss: input.settings.enableRss,
    enableAutomaticSearch: input.settings.enableAutomaticSearch,
    enableInteractiveSearch: input.settings.enableInteractiveSearch,
    priority: input.settings.priority,
    fields,
    tags: remoteArrayProperty(input.existingRemote, "tags"),
  }

  const downloadClientId = remoteProperty(input.existingRemote, "downloadClientId")
  if (downloadClientId !== undefined) {
    Object.assign(payload, { downloadClientId })
  }

  const seasonSearchMaximumSingleEpisodeAge = remoteProperty(
    input.existingRemote,
    "seasonSearchMaximumSingleEpisodeAge",
  )
  if (input.application.type === "sonarr" && seasonSearchMaximumSingleEpisodeAge !== undefined) {
    Object.assign(payload, { seasonSearchMaximumSingleEpisodeAge })
  }

  return payload
}

function findRemoteIndexer(input: {
  readonly protocol: IndexerProtocol
  readonly application: typeof indexerApplications.$inferSelect
  readonly mapping: typeof indexerApplicationMappings.$inferSelect | undefined
  readonly remoteIndexers: ReadonlyArray<RemoteIndexer>
}): RemoteIndexer | undefined {
  if (input.mapping) {
    const mapped = input.remoteIndexers.find(
      (indexer) => indexer.id === input.mapping?.remoteIndexerId,
    )
    if (mapped) return mapped
  }

  const expectedBaseUrl = aggregateBaseUrl(input.application.syncBaseUrl, input.protocol)
  const implementation = implementationName(input.protocol)
  return input.remoteIndexers.find(
    (indexer) =>
      indexer.implementation === implementation &&
      remoteFieldValue(indexer, "baseUrl") === expectedBaseUrl,
  )
}

// ── Live implementation ──

export const IndexerApplicationServiceLive = Layer.effect(
  IndexerApplicationService,
  Effect.gen(function* () {
    const db = yield* Db
    const crypto = yield* CryptoService
    const indexerService = yield* IndexerService

    const loadWithMappings = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select()
          .from(indexerApplications)
          .where(eq(indexerApplications.id, id))
        const application = rows[0]
        if (!application) return yield* new NotFoundError({ entity: "indexer_application", id })

        const mappings = yield* db
          .select()
          .from(indexerApplicationMappings)
          .where(eq(indexerApplicationMappings.applicationId, id))
          .orderBy(indexerApplicationMappings.protocol)

        return toApplication(application, mappings)
      })

    const loadProtocolFeeds = () =>
      Effect.gen(function* () {
        yield* indexerService.seedBuiltInDefinitions()
        const rows = yield* db
          .select({ indexer: indexers, definition: indexerDefinitions })
          .from(indexers)
          .leftJoin(
            indexerDefinitions,
            eq(indexers.definitionKey, indexerDefinitions.definitionKey),
          )
          .where(eq(indexers.enabled, true))

        const feeds = new Map<IndexerProtocol, { categories: Set<number>; indexerCount: number }>()
        for (const row of rows) {
          if (!row.indexer.searchEnabled && !row.indexer.rssEnabled) continue
          const protocol = protocolForIndexer(row.indexer, row.definition)
          const feed = feeds.get(protocol) ?? { categories: new Set<number>(), indexerCount: 0 }
          feed.indexerCount++
          for (const category of categoryIdsForIndexer(row.indexer, row.definition)) {
            feed.categories.add(category)
          }
          feeds.set(protocol, feed)
        }

        return feeds
      })

    const saveMapping = (
      applicationId: number,
      protocol: IndexerProtocol,
      remoteIndexer: RemoteIndexer,
    ) =>
      db
        .insert(indexerApplicationMappings)
        .values({
          applicationId,
          protocol,
          remoteIndexerId: remoteIndexer.id,
          remoteIndexerName: remoteIndexer.name,
        })
        .onConflictDoUpdate({
          target: [indexerApplicationMappings.applicationId, indexerApplicationMappings.protocol],
          set: {
            remoteIndexerId: remoteIndexer.id,
            remoteIndexerName: remoteIndexer.name,
            updatedAt: new Date(),
          },
        })

    const deleteMapping = (mappingId: number) =>
      db.delete(indexerApplicationMappings).where(eq(indexerApplicationMappings.id, mappingId))

    const syncApplication = (application: typeof indexerApplications.$inferSelect) => {
      const run = Effect.gen(function* () {
        const [apiKey, syncApiKey] = yield* Effect.all([
          crypto.decrypt(application.apiKeyEncrypted),
          crypto.decrypt(application.syncApiKeyEncrypted),
        ])
        const settings = normalizeSettings(application.settings)
        const protocolFeeds = yield* loadProtocolFeeds()
        const existingMappings = yield* db
          .select()
          .from(indexerApplicationMappings)
          .where(eq(indexerApplicationMappings.applicationId, application.id))

        const plannedItems = PROTOCOL_ORDER.map((protocol) => {
          const feed = protocolFeeds.get(protocol)
          const categories = feed
            ? filteredCategories(application.type, settings, Array.from(feed.categories))
            : []
          return { protocol, categories, indexerCount: feed?.indexerCount ?? 0 }
        })

        const remoteIndexersNeeded = plannedItems.some(
          (item) => item.indexerCount > 0 && item.categories.length > 0,
        )

        const [remoteSchemas, remoteIndexers] = remoteIndexersNeeded
          ? yield* Effect.tryPromise({
              try: () =>
                Promise.all([
                  fetchRemoteIndexerSchema(application.baseUrl, apiKey),
                  fetchRemoteIndexers(application.baseUrl, apiKey),
                ]),
              catch: (error) => toApplicationError(application, error),
            })
          : [[], []]

        const items: Array<IndexerApplicationSyncItem> = []

        for (const item of plannedItems) {
          const mapping = existingMappings.find((remote) => remote.protocol === item.protocol)

          if (item.indexerCount === 0) {
            if (mapping) {
              yield* Effect.tryPromise({
                try: () =>
                  deleteRemoteIndexer(application.baseUrl, apiKey, mapping.remoteIndexerId),
                catch: (error) => toApplicationError(application, error),
              })
              yield* deleteMapping(mapping.id)
              items.push({
                protocol: item.protocol,
                action: "removed",
                remoteIndexerId: mapping.remoteIndexerId,
                remoteIndexerName: mapping.remoteIndexerName,
                categories: [],
                reason: "no enabled indexers for protocol",
              })
              continue
            }

            items.push({
              protocol: item.protocol,
              action: "skipped",
              remoteIndexerId: null,
              remoteIndexerName: null,
              categories: [],
              reason: "no enabled indexers for protocol",
            })
            continue
          }

          if (item.categories.length === 0) {
            if (mapping && settings.syncLevel === "full") {
              yield* Effect.tryPromise({
                try: () =>
                  deleteRemoteIndexer(application.baseUrl, apiKey, mapping.remoteIndexerId),
                catch: (error) => toApplicationError(application, error),
              })
              yield* deleteMapping(mapping.id)
              items.push({
                protocol: item.protocol,
                action: "removed",
                remoteIndexerId: mapping.remoteIndexerId,
                remoteIndexerName: mapping.remoteIndexerName,
                categories: [],
                reason: "no categories match application sync filter",
              })
              continue
            }

            items.push({
              protocol: item.protocol,
              action: "skipped",
              remoteIndexerId: null,
              remoteIndexerName: null,
              categories: [],
              reason: "no categories match application sync filter",
            })
            continue
          }

          const implementation = implementationName(item.protocol)
          const schema = remoteSchemas.find((remote) => remote.implementation === implementation)
          const existingRemote = findRemoteIndexer({
            protocol: item.protocol,
            application,
            mapping,
            remoteIndexers,
          })

          if (existingRemote && settings.syncLevel === "add_only") {
            yield* saveMapping(application.id, item.protocol, existingRemote)
            items.push({
              protocol: item.protocol,
              action: "skipped",
              remoteIndexerId: existingRemote.id,
              remoteIndexerName: existingRemote.name,
              categories: item.categories,
              reason: "remote aggregate indexer already exists",
            })
            continue
          }

          const payload = buildRemoteIndexerPayload({
            application,
            settings,
            protocol: item.protocol,
            categories: item.categories,
            schema,
            syncApiKey,
            remoteId: existingRemote?.id ?? null,
            existingRemote,
          })

          const remoteIndexer = yield* Effect.tryPromise({
            try: () =>
              createOrUpdateRemoteIndexer(
                application.baseUrl,
                apiKey,
                payload,
                existingRemote?.id ?? null,
              ),
            catch: (error) => toApplicationError(application, error),
          })

          yield* saveMapping(application.id, item.protocol, remoteIndexer)
          items.push({
            protocol: item.protocol,
            action: existingRemote ? "updated" : "created",
            remoteIndexerId: remoteIndexer.id,
            remoteIndexerName: remoteIndexer.name,
            categories: item.categories,
          })
        }

        const syncedAt = new Date()
        yield* db
          .update(indexerApplications)
          .set({ lastSyncedAt: syncedAt, lastError: null, updatedAt: syncedAt })
          .where(eq(indexerApplications.id, application.id))

        return {
          applicationId: application.id,
          syncedAt,
          created: items.filter((item) => item.action === "created").length,
          updated: items.filter((item) => item.action === "updated").length,
          removed: items.filter((item) => item.action === "removed").length,
          skipped: items.filter((item) => item.action === "skipped").length,
          items,
        } satisfies IndexerApplicationSyncResult
      })

      return run.pipe(
        Effect.tapError((error) => {
          if (error._tag !== "IndexerApplicationError") return Effect.void
          return db
            .update(indexerApplications)
            .set({ lastError: error.message, updatedAt: new Date() })
            .where(eq(indexerApplications.id, application.id))
        }),
      )
    }

    return {
      add: (input) =>
        Effect.gen(function* () {
          const [apiKeyEncrypted, syncApiKeyEncrypted] = yield* Effect.all([
            crypto.encrypt(input.apiKey),
            crypto.encrypt(input.syncApiKey),
          ])
          const rows = yield* db
            .insert(indexerApplications)
            .values({
              name: input.name,
              type: input.type,
              baseUrl: input.baseUrl,
              apiKeyEncrypted,
              syncBaseUrl: input.syncBaseUrl,
              syncApiKeyEncrypted,
              enabled: input.enabled ?? true,
              settings: normalizeSettings(input.settings ?? {}),
            })
            .returning()

          return toApplication(rows[0], [])
        }),

      list: () =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(indexerApplications)
            .orderBy(indexerApplications.name)
          const mappings = yield* db.select().from(indexerApplicationMappings)
          return rows.map((row) =>
            toApplication(
              row,
              mappings.filter((mapping) => mapping.applicationId === row.id),
            ),
          )
        }),

      getById: (id) => loadWithMappings(id),

      update: (id, data) =>
        Effect.gen(function* () {
          const updateData: Record<string, unknown> = {}
          if (data.name !== undefined) updateData.name = data.name
          if (data.type !== undefined) updateData.type = data.type
          if (data.baseUrl !== undefined) updateData.baseUrl = data.baseUrl
          if (data.syncBaseUrl !== undefined) updateData.syncBaseUrl = data.syncBaseUrl
          if (data.enabled !== undefined) updateData.enabled = data.enabled
          if (data.settings !== undefined) updateData.settings = normalizeSettings(data.settings)
          if (data.apiKey !== undefined)
            updateData.apiKeyEncrypted = yield* crypto.encrypt(data.apiKey)
          if (data.syncApiKey !== undefined) {
            updateData.syncApiKeyEncrypted = yield* crypto.encrypt(data.syncApiKey)
          }
          updateData.updatedAt = new Date()

          const rows = yield* db
            .update(indexerApplications)
            .set(updateData)
            .where(eq(indexerApplications.id, id))
            .returning({ id: indexerApplications.id })

          if (rows.length === 0)
            return yield* new NotFoundError({ entity: "indexer_application", id })
          return yield* loadWithMappings(id)
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const rows = yield* db
            .delete(indexerApplications)
            .where(eq(indexerApplications.id, id))
            .returning({ id: indexerApplications.id })

          if (rows.length === 0)
            return yield* new NotFoundError({ entity: "indexer_application", id })
        }),

      sync: (id) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(indexerApplications)
            .where(eq(indexerApplications.id, id))
          const application = rows[0]
          if (!application) return yield* new NotFoundError({ entity: "indexer_application", id })
          return yield* syncApplication(application)
        }),

      syncEnabled: () =>
        Effect.gen(function* () {
          const applications = yield* db
            .select()
            .from(indexerApplications)
            .where(eq(indexerApplications.enabled, true))
            .orderBy(indexerApplications.name)

          const results: Array<IndexerApplicationSyncResult> = []
          const errors: Array<IndexerApplicationSyncFailure> = []

          for (const application of applications) {
            const outcome = yield* syncApplication(application).pipe(
              Effect.map((result) => ({ ok: true as const, result })),
              Effect.catchAll((error) => Effect.succeed({ ok: false as const, error })),
            )

            if (outcome.ok) {
              results.push(outcome.result)
            } else {
              errors.push(toSyncFailure(application, outcome.error))
            }
          }

          return {
            syncedAt: new Date(),
            total: applications.length,
            succeeded: results.length,
            failed: errors.length,
            results,
            errors,
          } satisfies IndexerApplicationSyncSummary
        }),
    }
  }),
)

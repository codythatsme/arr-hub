import { createHash } from "node:crypto"

import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { indexerDefinitionSources, indexerDefinitions } from "#/db/schema"

import type { IndexerDefinitionSeed, IndexerDefinitionSyncAction } from "../domain/indexer"
import type {
  IndexerDefinitionSourceCatalogAction,
  IndexerDefinitionSourceCatalogImportResult,
  IndexerDefinitionSourceCatalogItem,
  IndexerDefinitionSource,
  IndexerDefinitionSourceRefreshFailure,
  IndexerDefinitionSourceRefreshResult,
  IndexerDefinitionSourceRefreshSummary,
} from "../domain/indexerDefinitionSource"
import { IndexerDefinitionSourceError, NotFoundError } from "../errors"
import { parseCardigannDefinitionYaml } from "./CardigannDefinitionLoader"
import { Db } from "./Db"

interface IndexerDefinitionSourceInput {
  readonly name: string
  readonly url: string
  readonly enabled?: boolean
  readonly pinnedSha256?: string | null
}

interface IndexerDefinitionSourceUpdate {
  readonly name?: string
  readonly url?: string
  readonly enabled?: boolean
  readonly pinnedSha256?: string | null
}

interface IndexerDefinitionSourceCatalogInput {
  readonly url: string
  readonly pinnedSha256: string
}

export class IndexerDefinitionSourceService extends Context.Tag(
  "@arr-hub/IndexerDefinitionSourceService",
)<
  IndexerDefinitionSourceService,
  {
    readonly add: (
      input: IndexerDefinitionSourceInput,
    ) => Effect.Effect<IndexerDefinitionSource, SqlError>
    readonly list: () => Effect.Effect<ReadonlyArray<IndexerDefinitionSource>, SqlError>
    readonly getById: (
      id: number,
    ) => Effect.Effect<IndexerDefinitionSource, NotFoundError | SqlError>
    readonly update: (
      id: number,
      data: IndexerDefinitionSourceUpdate,
    ) => Effect.Effect<IndexerDefinitionSource, NotFoundError | SqlError>
    readonly remove: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
    readonly refresh: (
      id: number,
    ) => Effect.Effect<
      IndexerDefinitionSourceRefreshResult,
      NotFoundError | IndexerDefinitionSourceError | SqlError
    >
    readonly refreshEnabled: () => Effect.Effect<IndexerDefinitionSourceRefreshSummary, SqlError>
    readonly importCatalog: (
      input: IndexerDefinitionSourceCatalogInput,
    ) => Effect.Effect<
      IndexerDefinitionSourceCatalogImportResult,
      IndexerDefinitionSourceError | SqlError
    >
  }
>() {}

const TIMEOUT_MS = 30_000
const SHA256_PATTERN = /^[\da-f]{64}$/i

class RemoteDefinitionHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

interface CatalogManifestEntry {
  readonly name: string
  readonly url: string
  readonly pinnedSha256: string
  readonly enabled: boolean
}

async function fetchDefinitionYaml(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      const message = await res.text().catch(() => res.statusText)
      throw new RemoteDefinitionHttpError(res.status, message || res.statusText)
    }
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function manifestSourceName(url: string): string {
  return `Catalog manifest ${url}`
}

function toSource(row: typeof indexerDefinitionSources.$inferSelect): IndexerDefinitionSource {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    enabled: row.enabled,
    pinnedSha256: row.pinnedSha256,
    lastCheckedAt: row.lastCheckedAt,
    lastError: row.lastError,
    lastDefinitionKey: row.lastDefinitionKey,
    lastVersion: row.lastVersion,
    lastSha256: row.lastSha256,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function normalizeSha256(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed.toLowerCase()
}

function requiredCatalogString(
  value: Record<string, unknown>,
  key: string,
  entryIndex: number,
): string {
  const raw = value[key]
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error(`catalog source ${entryIndex + 1} must include ${key}`)
  }
  return raw.trim()
}

function parseCatalogManifest(source: string): ReadonlyArray<CatalogManifestEntry> {
  const root = JSON.parse(source) as Record<string, unknown>
  if (!root || typeof root !== "object" || !Array.isArray(root.sources)) {
    throw new Error("catalog manifest must include a sources array")
  }

  return root.sources.map((entry, index): CatalogManifestEntry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`catalog source ${index + 1} must be an object`)
    }
    const record = entry as Record<string, unknown>
    const name = requiredCatalogString(record, "name", index)
    const url = requiredCatalogString(record, "url", index)
    const rawSha256 =
      typeof record.pinnedSha256 === "string"
        ? record.pinnedSha256
        : typeof record.sha256 === "string"
          ? record.sha256
          : null
    const pinnedSha256 = normalizeSha256(rawSha256)

    try {
      if (!new URL(url).protocol) {
        throw new Error("missing protocol")
      }
    } catch {
      throw new Error(`catalog source ${index + 1} has an invalid url`)
    }

    if (!pinnedSha256 || !SHA256_PATTERN.test(pinnedSha256)) {
      throw new Error(`catalog source ${index + 1} must include a pinned SHA-256 checksum`)
    }

    return {
      name,
      url,
      pinnedSha256,
      enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    }
  })
}

function toManifestError(
  manifestUrl: string,
  reason: "connection_failed" | "invalid_response" | "checksum_mismatch",
  message: string,
  retryable: boolean,
): IndexerDefinitionSourceError {
  return new IndexerDefinitionSourceError({
    sourceId: 0,
    sourceName: manifestSourceName(manifestUrl),
    reason,
    message,
    retryable,
  })
}

function sourceErrorTagged(error: unknown): error is IndexerDefinitionSourceError {
  return (
    error instanceof IndexerDefinitionSourceError ||
    (typeof error === "object" &&
      error !== null &&
      "_tag" in error &&
      error._tag === "IndexerDefinitionSourceError")
  )
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

function toSourceError(
  source: typeof indexerDefinitionSources.$inferSelect,
  error: unknown,
): IndexerDefinitionSourceError {
  if (sourceErrorTagged(error)) {
    return error
  }

  if (error instanceof RemoteDefinitionHttpError) {
    return new IndexerDefinitionSourceError({
      sourceId: source.id,
      sourceName: source.name,
      reason: error.status >= 500 ? "connection_failed" : "sync_failed",
      message: `HTTP ${error.status}: ${error.message}`,
      retryable: error.status >= 500,
    })
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new IndexerDefinitionSourceError({
      sourceId: source.id,
      sourceName: source.name,
      reason: "connection_failed",
      message: "request timed out",
      retryable: true,
    })
  }

  const message = error instanceof Error ? error.message : "unknown error"
  return new IndexerDefinitionSourceError({
    sourceId: source.id,
    sourceName: source.name,
    reason: /fetch|network|ECONN|ENOTFOUND/i.test(message)
      ? "connection_failed"
      : "invalid_response",
    message,
    retryable: true,
  })
}

function toRefreshFailure(
  source: typeof indexerDefinitionSources.$inferSelect,
  error: unknown,
): IndexerDefinitionSourceRefreshFailure {
  if (sourceErrorTagged(error)) {
    const sourceError = error
    return {
      sourceId: sourceError.sourceId,
      sourceName: sourceError.sourceName,
      message: sourceError.message,
      reason: sourceError.reason,
      retryable: sourceError.retryable,
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  return {
    sourceId: source.id,
    sourceName: source.name,
    message,
    reason: "sync_failed",
    retryable: true,
  }
}

export const IndexerDefinitionSourceServiceLive = Layer.effect(
  IndexerDefinitionSourceService,
  Effect.gen(function* () {
    const db = yield* Db

    const loadSourceRow = (id: number) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select()
          .from(indexerDefinitionSources)
          .where(eq(indexerDefinitionSources.id, id))
        const row = rows[0]
        if (!row) return yield* new NotFoundError({ entity: "indexer_definition_source", id })
        return row
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

    const refreshSource = (source: typeof indexerDefinitionSources.$inferSelect) => {
      const run = Effect.gen(function* () {
        const sourceYaml = yield* Effect.tryPromise({
          try: () => fetchDefinitionYaml(source.url),
          catch: (error) => toSourceError(source, error),
        })
        const sourceSha256 = sha256Hex(sourceYaml)
        const pinnedSha256 = normalizeSha256(source.pinnedSha256)
        if (pinnedSha256 && !SHA256_PATTERN.test(pinnedSha256)) {
          return yield* new IndexerDefinitionSourceError({
            sourceId: source.id,
            sourceName: source.name,
            reason: "checksum_mismatch",
            message: "pinned SHA-256 checksum is invalid",
            retryable: false,
          })
        }
        if (pinnedSha256 && pinnedSha256 !== sourceSha256) {
          return yield* new IndexerDefinitionSourceError({
            sourceId: source.id,
            sourceName: source.name,
            reason: "checksum_mismatch",
            message: `SHA-256 checksum mismatch: expected ${pinnedSha256}, got ${sourceSha256}`,
            retryable: false,
          })
        }

        const definition = yield* Effect.try({
          try: () => ({
            ...parseCardigannDefinitionYaml(sourceYaml),
            sourceYaml,
          }),
          catch: (error) => toSourceError(source, error),
        })

        const existingRows = yield* db
          .select()
          .from(indexerDefinitions)
          .where(eq(indexerDefinitions.definitionKey, definition.definitionKey))
        const existing = existingRows[0]
        const action: IndexerDefinitionSyncAction =
          existing === undefined
            ? "created"
            : definitionChanged(existing, definition)
              ? "updated"
              : "unchanged"

        const refreshedAt = new Date()
        if (action !== "unchanged") {
          yield* upsertDefinition(definition, refreshedAt)
        }

        yield* db
          .update(indexerDefinitionSources)
          .set({
            lastCheckedAt: refreshedAt,
            lastError: null,
            lastDefinitionKey: definition.definitionKey,
            lastVersion: definition.version,
            lastSha256: sourceSha256,
            updatedAt: refreshedAt,
          })
          .where(eq(indexerDefinitionSources.id, source.id))

        return {
          sourceId: source.id,
          refreshedAt,
          definitionKey: definition.definitionKey,
          displayName: definition.displayName,
          previousVersion: existing?.version ?? null,
          version: definition.version,
          sourceSha256,
          action,
        } satisfies IndexerDefinitionSourceRefreshResult
      })

      return run.pipe(
        Effect.tapError((error) => {
          if (error._tag !== "IndexerDefinitionSourceError") return Effect.void
          const failedAt = new Date()
          return db
            .update(indexerDefinitionSources)
            .set({
              lastCheckedAt: failedAt,
              lastError: error.message,
              updatedAt: failedAt,
            })
            .where(eq(indexerDefinitionSources.id, source.id))
        }),
      )
    }

    const upsertCatalogSource = (entry: CatalogManifestEntry, now: Date) =>
      Effect.gen(function* () {
        const existingRows = yield* db
          .select()
          .from(indexerDefinitionSources)
          .where(eq(indexerDefinitionSources.url, entry.url))
        const existing = existingRows[0]

        if (!existing) {
          const rows = yield* db
            .insert(indexerDefinitionSources)
            .values({
              name: entry.name,
              url: entry.url,
              enabled: entry.enabled,
              pinnedSha256: entry.pinnedSha256,
              updatedAt: now,
            })
            .returning()
          const row = rows[0]
          return {
            sourceId: row.id,
            name: row.name,
            url: row.url,
            pinnedSha256: row.pinnedSha256 ?? entry.pinnedSha256,
            enabled: row.enabled,
            action: "created",
          } satisfies IndexerDefinitionSourceCatalogItem
        }

        const action: IndexerDefinitionSourceCatalogAction =
          existing.name !== entry.name ||
          existing.enabled !== entry.enabled ||
          existing.pinnedSha256 !== entry.pinnedSha256
            ? "updated"
            : "unchanged"

        const row =
          action === "updated"
            ? (yield* db
                .update(indexerDefinitionSources)
                .set({
                  name: entry.name,
                  enabled: entry.enabled,
                  pinnedSha256: entry.pinnedSha256,
                  updatedAt: now,
                })
                .where(eq(indexerDefinitionSources.id, existing.id))
                .returning())[0]
            : existing

        return {
          sourceId: row.id,
          name: row.name,
          url: row.url,
          pinnedSha256: row.pinnedSha256 ?? entry.pinnedSha256,
          enabled: row.enabled,
          action,
        } satisfies IndexerDefinitionSourceCatalogItem
      })

    return {
      add: (input) =>
        Effect.gen(function* () {
          const rows = yield* db
            .insert(indexerDefinitionSources)
            .values({
              name: input.name,
              url: input.url,
              enabled: input.enabled ?? true,
              pinnedSha256: normalizeSha256(input.pinnedSha256) ?? null,
            })
            .returning()
          return toSource(rows[0])
        }),

      list: () =>
        Effect.gen(function* () {
          const rows = yield* db
            .select()
            .from(indexerDefinitionSources)
            .orderBy(indexerDefinitionSources.name)
          return rows.map(toSource)
        }),

      getById: (id) =>
        Effect.gen(function* () {
          return toSource(yield* loadSourceRow(id))
        }),

      update: (id, data) =>
        Effect.gen(function* () {
          const updateData: Record<string, unknown> = { updatedAt: new Date() }
          if (data.name !== undefined) updateData.name = data.name
          if (data.url !== undefined) updateData.url = data.url
          if (data.enabled !== undefined) updateData.enabled = data.enabled
          if (data.pinnedSha256 !== undefined) {
            updateData.pinnedSha256 = normalizeSha256(data.pinnedSha256)
          }

          const rows = yield* db
            .update(indexerDefinitionSources)
            .set(updateData)
            .where(eq(indexerDefinitionSources.id, id))
            .returning()
          if (rows.length === 0) {
            return yield* new NotFoundError({ entity: "indexer_definition_source", id })
          }
          return toSource(rows[0])
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const rows = yield* db
            .delete(indexerDefinitionSources)
            .where(eq(indexerDefinitionSources.id, id))
            .returning({ id: indexerDefinitionSources.id })
          if (rows.length === 0) {
            return yield* new NotFoundError({ entity: "indexer_definition_source", id })
          }
        }),

      refresh: (id) =>
        Effect.gen(function* () {
          const source = yield* loadSourceRow(id)
          return yield* refreshSource(source)
        }),

      refreshEnabled: () =>
        Effect.gen(function* () {
          const sources = yield* db
            .select()
            .from(indexerDefinitionSources)
            .where(eq(indexerDefinitionSources.enabled, true))
            .orderBy(indexerDefinitionSources.name)

          const results: Array<IndexerDefinitionSourceRefreshResult> = []
          const errors: Array<IndexerDefinitionSourceRefreshFailure> = []

          for (const source of sources) {
            const outcome = yield* refreshSource(source).pipe(
              Effect.map((result) => ({ ok: true as const, result })),
              Effect.catchAll((error) => Effect.succeed({ ok: false as const, error })),
            )

            if (outcome.ok) {
              results.push(outcome.result)
            } else {
              errors.push(toRefreshFailure(source, outcome.error))
            }
          }

          return {
            refreshedAt: new Date(),
            total: sources.length,
            succeeded: results.length,
            failed: errors.length,
            results,
            errors,
          } satisfies IndexerDefinitionSourceRefreshSummary
        }),

      importCatalog: (input) =>
        Effect.gen(function* () {
          const pinnedSha256 = normalizeSha256(input.pinnedSha256)
          if (!pinnedSha256) {
            return yield* toManifestError(
              input.url,
              "checksum_mismatch",
              "catalog manifest SHA-256 checksum is required",
              false,
            )
          }
          if (!SHA256_PATTERN.test(pinnedSha256)) {
            return yield* toManifestError(
              input.url,
              "checksum_mismatch",
              "catalog manifest SHA-256 checksum is invalid",
              false,
            )
          }

          const manifestYaml = yield* Effect.tryPromise({
            try: () => fetchDefinitionYaml(input.url),
            catch: (error) => {
              if (error instanceof RemoteDefinitionHttpError) {
                return toManifestError(
                  input.url,
                  error.status >= 500 ? "connection_failed" : "invalid_response",
                  `HTTP ${error.status}: ${error.message}`,
                  error.status >= 500,
                )
              }
              if (error instanceof Error && error.name === "AbortError") {
                return toManifestError(input.url, "connection_failed", "request timed out", true)
              }
              const message = error instanceof Error ? error.message : "unknown error"
              return toManifestError(
                input.url,
                /fetch|network|ECONN|ENOTFOUND/i.test(message)
                  ? "connection_failed"
                  : "invalid_response",
                message,
                true,
              )
            },
          })

          const manifestSha256 = sha256Hex(manifestYaml)
          if (pinnedSha256 !== manifestSha256) {
            return yield* toManifestError(
              input.url,
              "checksum_mismatch",
              `catalog manifest SHA-256 checksum mismatch: expected ${pinnedSha256}, got ${manifestSha256}`,
              false,
            )
          }

          const entries = yield* Effect.try({
            try: () => parseCatalogManifest(manifestYaml),
            catch: (error) =>
              toManifestError(
                input.url,
                "invalid_response",
                error instanceof Error ? error.message : "invalid catalog manifest",
                false,
              ),
          })

          const importedAt = new Date()
          const sources = yield* Effect.forEach(entries, (entry) =>
            upsertCatalogSource(entry, importedAt),
          )

          return {
            importedAt,
            manifestUrl: input.url,
            manifestSha256,
            total: sources.length,
            created: sources.filter((source) => source.action === "created").length,
            updated: sources.filter((source) => source.action === "updated").length,
            unchanged: sources.filter((source) => source.action === "unchanged").length,
            sources,
          } satisfies IndexerDefinitionSourceCatalogImportResult
        }),
    }
  }),
)

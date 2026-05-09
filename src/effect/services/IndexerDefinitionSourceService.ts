import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { indexerDefinitionSources, indexerDefinitions } from "#/db/schema"

import type { IndexerDefinitionSeed, IndexerDefinitionSyncAction } from "../domain/indexer"
import type {
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
}

interface IndexerDefinitionSourceUpdate {
  readonly name?: string
  readonly url?: string
  readonly enabled?: boolean
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
  }
>() {}

const TIMEOUT_MS = 30_000

class RemoteDefinitionHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
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

function toSource(row: typeof indexerDefinitionSources.$inferSelect): IndexerDefinitionSource {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    enabled: row.enabled,
    lastCheckedAt: row.lastCheckedAt,
    lastError: row.lastError,
    lastDefinitionKey: row.lastDefinitionKey,
    lastVersion: row.lastVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
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
  if (
    error instanceof IndexerDefinitionSourceError ||
    (typeof error === "object" &&
      error !== null &&
      "_tag" in error &&
      error._tag === "IndexerDefinitionSourceError")
  ) {
    const sourceError = error as IndexerDefinitionSourceError
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

    return {
      add: (input) =>
        Effect.gen(function* () {
          const rows = yield* db
            .insert(indexerDefinitionSources)
            .values({
              name: input.name,
              url: input.url,
              enabled: input.enabled ?? true,
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
    }
  }),
)

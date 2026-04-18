import { SqlClient } from "@effect/sql"
import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { z } from "zod"

import { qualityProfiles, movies, series, seasons } from "#/db/schema"

import * as radarr from "../../lib/import/radarr-client"
import { posterOf, type RadarrMovie, type SonarrSeries } from "../../lib/import/schemas"
import * as sonarr from "../../lib/import/sonarr-client"
import { ImportError } from "../errors"
import { Db } from "./Db"
import { OnboardingService } from "./OnboardingService"

// ── Types ──

export interface ImportResult {
  readonly imported: number
  readonly skipped: number
}

export interface ConnectionTestResult {
  readonly version: string
}

export interface ImportCredentials {
  readonly url: string
  readonly apiKey: string
}

// ── Service ──

export class ImportService extends Context.Tag("@arr-hub/ImportService")<
  ImportService,
  {
    readonly testRadarr: (
      input: ImportCredentials,
    ) => Effect.Effect<ConnectionTestResult, ImportError>
    readonly testSonarr: (
      input: ImportCredentials,
    ) => Effect.Effect<ConnectionTestResult, ImportError>
    readonly importFromRadarr: (
      input: ImportCredentials,
    ) => Effect.Effect<ImportResult, ImportError | SqlError>
    readonly importFromSonarr: (
      input: ImportCredentials,
    ) => Effect.Effect<ImportResult, ImportError | SqlError>
  }
>() {}

// ── Helpers ──

function toImportError(source: "radarr" | "sonarr", e: unknown): ImportError {
  if (e instanceof z.ZodError) {
    return new ImportError({
      source,
      reason: "invalid_response",
      message: `schema validation failed: ${e.issues.map((i) => i.message).join(", ")}`,
    })
  }
  if (e instanceof Error && e.name === "AbortError") {
    return new ImportError({
      source,
      reason: "connection_failed",
      message: "request timed out",
    })
  }
  const msg = e instanceof Error ? e.message : "unknown error"
  const isConnection = /HTTP \d{3}|fetch|network|ECONN|ENOTFOUND/i.test(msg)
  return new ImportError({
    source,
    reason: isConnection ? "connection_failed" : "invalid_response",
    message: msg,
  })
}

function mapSonarrStatus(status: string): "continuing" | "ended" | "wanted" | "available" {
  if (status === "continuing") return "continuing"
  if (status === "ended") return "ended"
  return "wanted"
}

// ── Live implementation ──

export const ImportServiceLive = Layer.effect(
  ImportService,
  Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient
    const onboarding = yield* OnboardingService

    const assertSetupActive = (): Effect.Effect<void, ImportError | SqlError> =>
      Effect.gen(function* () {
        const status = yield* onboarding.getStatus()
        if (status.completed) {
          return yield* new ImportError({
            source: "radarr",
            reason: "setup_not_active",
            message: "library import is only available during setup",
          })
        }
      })

    const loadDefaultProfileId = (): Effect.Effect<number | null, SqlError> =>
      Effect.gen(function* () {
        const rows = yield* db
          .select({ id: qualityProfiles.id })
          .from(qualityProfiles)
          .where(eq(qualityProfiles.isDefault, true))
          .limit(1)
        return rows[0]?.id ?? null
      })

    const testRadarr = (input: ImportCredentials) =>
      Effect.tryPromise({
        try: () => radarr.testConnection(input.url, input.apiKey),
        catch: (e) => toImportError("radarr", e),
      })

    const testSonarr = (input: ImportCredentials) =>
      Effect.tryPromise({
        try: () => sonarr.testConnection(input.url, input.apiKey),
        catch: (e) => toImportError("sonarr", e),
      })

    const insertRadarrMovie = (m: RadarrMovie, defaultProfileId: number | null) =>
      Effect.gen(function* () {
        const existing = yield* db
          .select({ id: movies.id })
          .from(movies)
          .where(eq(movies.tmdbId, m.tmdbId))
          .limit(1)
        if (existing.length > 0) return "skipped" as const
        yield* db.insert(movies).values({
          tmdbId: m.tmdbId,
          title: m.title,
          year: m.year ?? null,
          overview: m.overview ?? null,
          posterPath: posterOf(m.images),
          status: m.hasFile ? "available" : "wanted",
          qualityProfileId: defaultProfileId,
          rootFolderPath: m.path ?? null,
          monitored: m.monitored,
          hasFile: m.hasFile,
        })
        return "imported" as const
      })

    const insertSonarrSeries = (s: SonarrSeries, defaultProfileId: number | null) =>
      Effect.gen(function* () {
        const existing = yield* db
          .select({ id: series.id })
          .from(series)
          .where(eq(series.tvdbId, s.tvdbId))
          .limit(1)
        if (existing.length > 0) return "skipped" as const
        const [row] = yield* db
          .insert(series)
          .values({
            tvdbId: s.tvdbId,
            title: s.title,
            year: s.year ?? null,
            overview: s.overview ?? null,
            posterPath: posterOf(s.images),
            status: mapSonarrStatus(s.status),
            network: s.network ?? null,
            rootFolderPath: s.path ?? null,
            monitored: s.monitored,
            qualityProfileId: defaultProfileId,
            seasonFolder: s.seasonFolder ?? true,
          })
          .returning({ id: series.id })
        for (const season of s.seasons) {
          yield* db.insert(seasons).values({
            seriesId: row.id,
            seasonNumber: season.seasonNumber,
            monitored: season.monitored,
          })
        }
        return "imported" as const
      })

    const importFromRadarr = (input: ImportCredentials) =>
      Effect.gen(function* () {
        yield* assertSetupActive()
        const list = yield* Effect.tryPromise({
          try: () => radarr.fetchMovies(input.url, input.apiKey),
          catch: (e) => toImportError("radarr", e),
        })
        const defaultProfileId = yield* loadDefaultProfileId()

        const run = Effect.gen(function* () {
          let imported = 0
          let skipped = 0
          for (const movie of list) {
            const result = yield* insertRadarrMovie(movie, defaultProfileId)
            if (result === "imported") imported++
            else skipped++
          }
          return { imported, skipped } satisfies ImportResult
        })

        return yield* sql.withTransaction(run).pipe(
          Effect.mapError(
            (e) =>
              new ImportError({
                source: "radarr",
                reason: "transaction_failed",
                message: e.message,
              }),
          ),
        )
      })

    const importFromSonarr = (input: ImportCredentials) =>
      Effect.gen(function* () {
        yield* assertSetupActive()
        const list = yield* Effect.tryPromise({
          try: () => sonarr.fetchSeries(input.url, input.apiKey),
          catch: (e) => toImportError("sonarr", e),
        })
        const defaultProfileId = yield* loadDefaultProfileId()

        const run = Effect.gen(function* () {
          let imported = 0
          let skipped = 0
          for (const s of list) {
            const result = yield* insertSonarrSeries(s, defaultProfileId)
            if (result === "imported") imported++
            else skipped++
          }
          return { imported, skipped } satisfies ImportResult
        })

        return yield* sql.withTransaction(run).pipe(
          Effect.mapError(
            (e) =>
              new ImportError({
                source: "sonarr",
                reason: "transaction_failed",
                message: e.message,
              }),
          ),
        )
      })

    return {
      testRadarr,
      testSonarr,
      importFromRadarr,
      importFromSonarr,
    }
  }),
)

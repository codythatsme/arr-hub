import { SqlError } from "@effect/sql/SqlError"
import { eq, like, and, type SQL } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { movies } from "#/db/schema"

import { NotFoundError, ConflictError } from "../errors"
import { Db } from "./Db"
import { ensureTagRows } from "./TagService"

type Movie = typeof movies.$inferSelect

interface MovieInput {
  readonly tmdbId: number
  readonly imdbId?: string | null
  readonly title: string
  readonly originalTitle?: string | null
  readonly year?: number | null
  readonly releaseDate?: Date | null
  readonly overview?: string | null
  readonly posterPath?: string | null
  readonly genres?: ReadonlyArray<string>
  readonly tags?: ReadonlyArray<string>
  readonly runtimeMinutes?: number | null
  readonly status?: "wanted" | "available" | "missing"
  readonly qualityProfileId?: number | null
  readonly rootFolderPath?: string | null
  readonly monitored?: boolean
  readonly metadataRefreshedAt?: Date | null
}

interface MovieUpdate {
  readonly imdbId?: string | null
  readonly title?: string
  readonly originalTitle?: string | null
  readonly year?: number | null
  readonly releaseDate?: Date | null
  readonly overview?: string | null
  readonly posterPath?: string | null
  readonly genres?: ReadonlyArray<string>
  readonly tags?: ReadonlyArray<string>
  readonly runtimeMinutes?: number | null
  readonly status?: "wanted" | "available" | "missing"
  readonly qualityProfileId?: number | null
  readonly rootFolderPath?: string | null
  readonly monitored?: boolean
  readonly metadataRefreshedAt?: Date | null
}

interface MovieFilters {
  readonly status?: "wanted" | "available" | "missing"
  readonly monitored?: boolean
}

export class MovieService extends Context.Tag("MovieService")<
  MovieService,
  {
    readonly add: (input: MovieInput) => Effect.Effect<Movie, ConflictError | SqlError>
    readonly list: (filters?: MovieFilters) => Effect.Effect<ReadonlyArray<Movie>, SqlError>
    readonly getById: (id: number) => Effect.Effect<Movie, NotFoundError | SqlError>
    readonly update: (
      id: number,
      data: MovieUpdate,
    ) => Effect.Effect<Movie, NotFoundError | SqlError>
    readonly remove: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
    readonly lookup: (query: string) => Effect.Effect<ReadonlyArray<Movie>, SqlError>
  }
>() {}

export const MovieServiceLive = Layer.effect(
  MovieService,
  Effect.gen(function* () {
    const db = yield* Db

    return {
      add: (input) =>
        Effect.gen(function* () {
          const existing = yield* db
            .select({ id: movies.id })
            .from(movies)
            .where(eq(movies.tmdbId, input.tmdbId))

          if (existing.length > 0) {
            return yield* new ConflictError({
              entity: "movie",
              field: "tmdbId",
              value: input.tmdbId,
            })
          }

          const tagLabels = yield* ensureTagRows(db, input.tags ?? [])
          const rows = yield* db
            .insert(movies)
            .values({
              tmdbId: input.tmdbId,
              imdbId: input.imdbId ?? null,
              title: input.title,
              originalTitle: input.originalTitle ?? null,
              year: input.year ?? null,
              releaseDate: input.releaseDate ?? null,
              overview: input.overview ?? null,
              posterPath: input.posterPath ?? null,
              genres: input.genres ?? [],
              tags: tagLabels,
              runtimeMinutes: input.runtimeMinutes ?? null,
              status: input.status ?? "wanted",
              qualityProfileId: input.qualityProfileId ?? null,
              rootFolderPath: input.rootFolderPath ?? null,
              monitored: input.monitored ?? true,
              metadataRefreshedAt: input.metadataRefreshedAt ?? null,
            })
            .returning()

          return rows[0]
        }),

      list: (filters) =>
        Effect.gen(function* () {
          const conditions: Array<SQL> = []
          if (filters?.status) {
            conditions.push(eq(movies.status, filters.status))
          }
          if (filters?.monitored !== undefined) {
            conditions.push(eq(movies.monitored, filters.monitored))
          }

          const where = conditions.length > 0 ? and(...conditions) : undefined

          return yield* db.select().from(movies).where(where)
        }),

      getById: (id) =>
        Effect.gen(function* () {
          const rows = yield* db.select().from(movies).where(eq(movies.id, id))

          const movie = rows[0]
          if (!movie) {
            return yield* new NotFoundError({ entity: "movie", id })
          }
          return movie
        }),

      update: (id, data) =>
        Effect.gen(function* () {
          const tagLabels = data.tags !== undefined ? yield* ensureTagRows(db, data.tags) : null
          const updateData =
            tagLabels === null
              ? data
              : {
                  ...data,
                  tags: tagLabels,
                }
          const rows = yield* db.update(movies).set(updateData).where(eq(movies.id, id)).returning()

          const movie = rows[0]
          if (!movie) {
            return yield* new NotFoundError({ entity: "movie", id })
          }
          return movie
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const rows = yield* db
            .delete(movies)
            .where(eq(movies.id, id))
            .returning({ id: movies.id })

          if (rows.length === 0) {
            return yield* new NotFoundError({ entity: "movie", id })
          }
        }),

      lookup: (query) =>
        Effect.gen(function* () {
          return yield* db
            .select()
            .from(movies)
            .where(like(movies.title, `%${query}%`))
        }),
    }
  }),
)

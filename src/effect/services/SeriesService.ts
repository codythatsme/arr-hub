import { SqlError } from "@effect/sql/SqlError"
import { eq, like, and, between, type SQL } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { series, seasons, episodes } from "#/db/schema"

import { NotFoundError, ConflictError } from "../errors"
import { Db } from "./Db"

// ── Types ──

export type Series = typeof series.$inferSelect
export type Season = typeof seasons.$inferSelect
export type Episode = typeof episodes.$inferSelect

export interface SeasonWithEpisodes {
  readonly season: Season
  readonly episodes: ReadonlyArray<Episode>
  readonly episodeCount: number
  readonly availableCount: number
}

export interface SeriesWithDetails {
  readonly series: Series
  readonly seasons: ReadonlyArray<SeasonWithEpisodes>
}

export interface EpisodeInput {
  readonly tvdbId: number
  readonly title: string
  readonly episodeNumber: number
  readonly airDate?: Date | null
  readonly overview?: string | null
  readonly hasFile?: boolean
  readonly filePath?: string | null
  readonly monitored?: boolean
}

export interface SeasonInput {
  readonly seasonNumber: number
  readonly monitored?: boolean
  readonly episodes?: ReadonlyArray<EpisodeInput>
}

export interface SeriesInput {
  readonly tvdbId: number
  readonly title: string
  readonly year?: number | null
  readonly overview?: string | null
  readonly posterPath?: string | null
  readonly status?: "continuing" | "ended" | "wanted" | "available"
  readonly network?: string | null
  readonly rootFolderPath?: string | null
  readonly monitored?: boolean
  readonly qualityProfileId?: number | null
  readonly seasonFolder?: boolean
  readonly seasons?: ReadonlyArray<SeasonInput>
}

export interface SeriesUpdate {
  readonly title?: string
  readonly year?: number | null
  readonly overview?: string | null
  readonly posterPath?: string | null
  readonly status?: "continuing" | "ended" | "wanted" | "available"
  readonly network?: string | null
  readonly rootFolderPath?: string | null
  readonly monitored?: boolean
  readonly qualityProfileId?: number | null
  readonly seasonFolder?: boolean
}

export interface SeriesFilters {
  readonly status?: "continuing" | "ended" | "wanted" | "available"
  readonly monitored?: boolean
}

export interface CalendarQuery {
  readonly start: Date
  readonly end: Date
}

export interface CalendarEpisode {
  readonly episode: Episode
  readonly season: Season
  readonly series: Series
}

// ── Service ──

export class SeriesService extends Context.Tag("@arr-hub/SeriesService")<
  SeriesService,
  {
    readonly add: (input: SeriesInput) => Effect.Effect<SeriesWithDetails, ConflictError | SqlError>
    readonly list: (filters?: SeriesFilters) => Effect.Effect<ReadonlyArray<Series>, SqlError>
    readonly getById: (
      id: number,
    ) => Effect.Effect<SeriesWithDetails, NotFoundError | SqlError>
    readonly update: (
      id: number,
      data: SeriesUpdate,
    ) => Effect.Effect<SeriesWithDetails, NotFoundError | SqlError>
    readonly remove: (id: number) => Effect.Effect<void, NotFoundError | SqlError>
    readonly lookup: (query: string) => Effect.Effect<ReadonlyArray<Series>, SqlError>
    readonly toggleSeasonMonitor: (
      seasonId: number,
      monitored: boolean,
    ) => Effect.Effect<SeasonWithEpisodes, NotFoundError | SqlError>
    readonly toggleEpisodeMonitor: (
      episodeId: number,
      monitored: boolean,
    ) => Effect.Effect<Episode, NotFoundError | SqlError>
    readonly calendar: (
      query: CalendarQuery,
    ) => Effect.Effect<ReadonlyArray<CalendarEpisode>, SqlError>
  }
>() {}

export const SeriesServiceLive = Layer.effect(
  SeriesService,
  Effect.gen(function* () {
    const db = yield* Db

    const loadSeasonWithEpisodes = (
      season: Season,
    ): Effect.Effect<SeasonWithEpisodes, SqlError> =>
      Effect.gen(function* () {
        const eps = yield* db
          .select()
          .from(episodes)
          .where(eq(episodes.seasonId, season.id))
        return {
          season,
          episodes: eps,
          episodeCount: eps.length,
          availableCount: eps.filter((e) => e.hasFile).length,
        }
      })

    const loadDetails = (seriesId: number): Effect.Effect<SeriesWithDetails, NotFoundError | SqlError> =>
      Effect.gen(function* () {
        const seriesRows = yield* db
          .select()
          .from(series)
          .where(eq(series.id, seriesId))
        const s = seriesRows[0]
        if (!s) {
          return yield* new NotFoundError({ entity: "series", id: seriesId })
        }

        const seasonRows = yield* db
          .select()
          .from(seasons)
          .where(eq(seasons.seriesId, seriesId))

        const seasonsWithEps = yield* Effect.all(seasonRows.map(loadSeasonWithEpisodes))

        return { series: s, seasons: seasonsWithEps }
      })

    return {
      add: (input) =>
        Effect.gen(function* () {
          const existing = yield* db
            .select({ id: series.id })
            .from(series)
            .where(eq(series.tvdbId, input.tvdbId))

          if (existing.length > 0) {
            return yield* new ConflictError({
              entity: "series",
              field: "tvdbId",
              value: input.tvdbId,
            })
          }

          const seriesMonitored = input.monitored ?? true

          const rows = yield* db
            .insert(series)
            .values({
              tvdbId: input.tvdbId,
              title: input.title,
              year: input.year ?? null,
              overview: input.overview ?? null,
              posterPath: input.posterPath ?? null,
              status: input.status ?? "wanted",
              network: input.network ?? null,
              rootFolderPath: input.rootFolderPath ?? null,
              monitored: seriesMonitored,
              qualityProfileId: input.qualityProfileId ?? null,
              seasonFolder: input.seasonFolder ?? true,
            })
            .returning()
          const s = rows[0]

          // scaffold seasons/episodes
          if (input.seasons) {
            for (const seasonInput of input.seasons) {
              const seasonMonitored = seriesMonitored
                ? (seasonInput.monitored ?? true)
                : false

              const [seasonRow] = yield* db
                .insert(seasons)
                .values({
                  seriesId: s.id,
                  seasonNumber: seasonInput.seasonNumber,
                  monitored: seasonMonitored,
                })
                .returning()

              if (seasonInput.episodes) {
                for (const epInput of seasonInput.episodes) {
                  const epMonitored = seasonMonitored
                    ? (epInput.monitored ?? true)
                    : false

                  yield* db.insert(episodes).values({
                    seasonId: seasonRow.id,
                    tvdbId: epInput.tvdbId,
                    title: epInput.title,
                    episodeNumber: epInput.episodeNumber,
                    airDate: epInput.airDate ?? null,
                    overview: epInput.overview ?? null,
                    hasFile: epInput.hasFile ?? false,
                    filePath: epInput.filePath ?? null,
                    monitored: epMonitored,
                  })
                }
              }
            }
          }

          return yield* loadDetails(s.id)
        }),

      list: (filters) =>
        Effect.gen(function* () {
          const conditions: Array<SQL> = []
          if (filters?.status) {
            conditions.push(eq(series.status, filters.status))
          }
          if (filters?.monitored !== undefined) {
            conditions.push(eq(series.monitored, filters.monitored))
          }
          const where = conditions.length > 0 ? and(...conditions) : undefined
          return yield* db.select().from(series).where(where)
        }),

      getById: (id) => loadDetails(id),

      update: (id, data) =>
        Effect.gen(function* () {
          const rows = yield* db
            .update(series)
            .set(data)
            .where(eq(series.id, id))
            .returning()

          if (rows.length === 0) {
            return yield* new NotFoundError({ entity: "series", id })
          }

          // cascade unmonitor
          if (data.monitored === false) {
            yield* db
              .update(seasons)
              .set({ monitored: false })
              .where(eq(seasons.seriesId, id))

            const seasonRows = yield* db
              .select({ id: seasons.id })
              .from(seasons)
              .where(eq(seasons.seriesId, id))

            for (const s of seasonRows) {
              yield* db
                .update(episodes)
                .set({ monitored: false })
                .where(eq(episodes.seasonId, s.id))
            }
          }

          return yield* loadDetails(id)
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const rows = yield* db
            .delete(series)
            .where(eq(series.id, id))
            .returning({ id: series.id })

          if (rows.length === 0) {
            return yield* new NotFoundError({ entity: "series", id })
          }
        }),

      lookup: (query) =>
        Effect.gen(function* () {
          return yield* db
            .select()
            .from(series)
            .where(like(series.title, `%${query}%`))
        }),

      toggleSeasonMonitor: (seasonId, monitored) =>
        Effect.gen(function* () {
          const rows = yield* db
            .update(seasons)
            .set({ monitored })
            .where(eq(seasons.id, seasonId))
            .returning()

          if (rows.length === 0) {
            return yield* new NotFoundError({ entity: "season", id: seasonId })
          }

          // cascade to all episodes in this season
          yield* db
            .update(episodes)
            .set({ monitored })
            .where(eq(episodes.seasonId, seasonId))

          return yield* loadSeasonWithEpisodes(rows[0])
        }),

      toggleEpisodeMonitor: (episodeId, monitored) =>
        Effect.gen(function* () {
          const rows = yield* db
            .update(episodes)
            .set({ monitored })
            .where(eq(episodes.id, episodeId))
            .returning()

          if (rows.length === 0) {
            return yield* new NotFoundError({ entity: "episode", id: episodeId })
          }

          return rows[0]
        }),

      calendar: (query) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({
              episode: episodes,
              season: seasons,
              series: series,
            })
            .from(episodes)
            .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
            .innerJoin(series, eq(seasons.seriesId, series.id))
            .where(
              and(
                between(episodes.airDate, query.start, query.end),
                eq(series.monitored, true),
                eq(episodes.monitored, true),
              ),
            )

          return rows
        }),
    }
  }),
)

import { describe, expect, it } from "@effect/vitest"
import { asc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"

import { episodes, movies, seasons, series } from "#/db/schema"
import { TmdbClientE2EFixtures } from "#/effect/fixtures/TmdbClientFixtures"
import { Db } from "#/effect/services/Db"
import { TestDbLive } from "#/effect/test/TestDb"

import { MetadataRefreshService, MetadataRefreshServiceLive } from "./MetadataRefreshService"

const TestLayer = MetadataRefreshServiceLive.pipe(
  Layer.provideMerge(TestDbLive),
  Layer.provideMerge(TmdbClientE2EFixtures),
)

describe("MetadataRefreshService", () => {
  it.effect("refreshMovie updates local metadata from TMDB", () =>
    Effect.gen(function* () {
      const db = yield* Db
      const svc = yield* MetadataRefreshService
      const [movie] = yield* db
        .insert(movies)
        .values({ tmdbId: 990001, title: "Old Movie" })
        .returning()

      const refreshed = yield* svc.refreshMovie(movie.id)

      expect(refreshed.title).toBe("E2E Fixture Movie")
      expect(refreshed.imdbId).toBe("tt990001")
      expect(refreshed.originalTitle).toBe("E2E Fixture Movie")
      expect(refreshed.year).toBe(2026)
      expect(refreshed.releaseDate?.toISOString().slice(0, 10)).toBe("2026-05-09")
      expect(refreshed.runtimeMinutes).toBe(90)
      expect(refreshed.metadataRefreshedAt).not.toBeNull()
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("refreshSeries updates series and creates season episodes", () =>
    Effect.gen(function* () {
      const db = yield* Db
      const svc = yield* MetadataRefreshService
      const [show] = yield* db
        .insert(series)
        .values({ tvdbId: 990002, tmdbId: 990002, title: "Old Series" })
        .returning()

      const refreshed = yield* svc.refreshSeries(show.id)

      expect(refreshed.title).toBe("E2E Fixture Series")
      expect(refreshed.imdbId).toBe("tt990002")
      expect(refreshed.network).toBe("E2E Network")
      expect(refreshed.status).toBe("continuing")
      expect(refreshed.metadataRefreshedAt).not.toBeNull()

      const seasonRows = yield* db
        .select()
        .from(seasons)
        .where(eq(seasons.seriesId, show.id))
        .orderBy(asc(seasons.seasonNumber))
      expect(seasonRows).toHaveLength(1)
      expect(seasonRows[0].tmdbId).toBe(990201)

      const episodeRows = yield* db
        .select()
        .from(episodes)
        .where(eq(episodes.seasonId, seasonRows[0].id))
        .orderBy(asc(episodes.episodeNumber))
      expect(episodeRows).toHaveLength(2)
      expect(episodeRows[0].title).toBe("Pilot")
      expect(episodeRows[0].airDate?.toISOString().slice(0, 10)).toBe("2026-05-09")
      expect(episodeRows[0].runtimeMinutes).toBe(45)
      expect(episodeRows[1].title).toBe("Second")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("refreshAllSeries skips series without TMDB IDs", () =>
    Effect.gen(function* () {
      const db = yield* Db
      const svc = yield* MetadataRefreshService
      yield* db.insert(series).values({ tvdbId: 123, title: "No TMDB" })

      const summary = yield* svc.refreshAllSeries()

      expect(summary).toEqual({ refreshed: 0, skipped: 1, failed: 0 })
    }).pipe(Effect.provide(TestLayer)),
  )
})

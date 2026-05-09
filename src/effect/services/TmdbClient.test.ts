import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"

import { TmdbClient, TmdbClientLive } from "./TmdbClient"

const withFixtures = <A, E>(effect: Effect.Effect<A, E, TmdbClient>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => process.env.ARR_HUB_E2E_FIXTURES),
    () =>
      Effect.sync(() => {
        process.env.ARR_HUB_E2E_FIXTURES = "1"
      }).pipe(
        Effect.flatMap(() => effect),
        Effect.provide(TmdbClientLive),
      ),
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) {
          delete process.env.ARR_HUB_E2E_FIXTURES
          return
        }
        process.env.ARR_HUB_E2E_FIXTURES = previous
      }),
  )

describe("TmdbClient", () => {
  it.effect("returns deterministic TV search fixtures", () =>
    withFixtures(
      Effect.gen(function* () {
        const client = yield* TmdbClient
        const result = yield* client.searchTvSeries("fixture")
        expect(result.totalResults).toBe(1)
        expect(result.results[0].id).toBe(990002)
        expect(result.results[0].name).toBe("E2E Fixture Series: fixture")
      }),
    ),
  )

  it.effect("returns TV details with external IDs", () =>
    withFixtures(
      Effect.gen(function* () {
        const client = yield* TmdbClient
        const details = yield* client.getTvSeries(990002)
        expect(details.tvdbId).toBe(990002)
        expect(details.imdbId).toBe("tt990002")
        expect(details.networks[0].name).toBe("E2E Network")
        expect(details.seasons[0].episodeCount).toBe(2)
      }),
    ),
  )

  it.effect("returns season episodes", () =>
    withFixtures(
      Effect.gen(function* () {
        const client = yield* TmdbClient
        const season = yield* client.getTvSeason(990002, 1)
        expect(season.episodes).toHaveLength(2)
        expect(season.episodes[0].title).toBe("Pilot")
        expect(season.episodes[0].airDate).toBe("2026-05-09")
      }),
    ),
  )
})

import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"

import { TmdbClientE2EFixtures } from "../fixtures/TmdbClientFixtures"
import { TmdbClient } from "./TmdbClient"

const withFixtures = <A, E>(effect: Effect.Effect<A, E, TmdbClient>) =>
  effect.pipe(Effect.provide(TmdbClientE2EFixtures))

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

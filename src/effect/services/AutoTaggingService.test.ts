import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { TestDbLive } from "#/effect/test/TestDb"

import { AutoTaggingService, AutoTaggingServiceLive } from "./AutoTaggingService"
import { MovieService, MovieServiceLive } from "./MovieService"
import { SeriesService, SeriesServiceLive } from "./SeriesService"
import { TagService, TagServiceLive } from "./TagService"

const TestLayer = Layer.mergeAll(
  AutoTaggingServiceLive,
  MovieServiceLive,
  SeriesServiceLive,
  TagServiceLive,
).pipe(Layer.provideMerge(TestDbLive))

describe("AutoTaggingService", () => {
  it.effect("applies matching movie auto-tagging rules on add", () =>
    Effect.gen(function* () {
      const autoTagging = yield* AutoTaggingService
      const movies = yield* MovieService
      const tags = yield* TagService

      const rule = yield* autoTagging.createRule({
        name: "Animation",
        tags: ["anime"],
        specifications: [{ type: "genre", value: ["Animation"] }],
      })
      const movie = yield* movies.add({
        tmdbId: 100,
        title: "Animated Movie",
        genres: ["Animation"],
      })
      const details = yield* tags.detailsList()
      const anime = details.find((tag) => tag.label === "anime")

      expect(movie.tags).toEqual(["anime"])
      expect(anime?.autoTagIds).toEqual([rule.id])
      expect(anime?.movieIds).toEqual([movie.id])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("removes rule tags when media stops matching and removal is enabled", () =>
    Effect.gen(function* () {
      const autoTagging = yield* AutoTaggingService
      const movies = yield* MovieService

      yield* autoTagging.createRule({
        name: "Animation",
        tags: ["anime"],
        specifications: [{ type: "genre", value: ["Animation"] }],
        removeTagsAutomatically: true,
      })
      const movie = yield* movies.add({
        tmdbId: 101,
        title: "Animated Movie",
        genres: ["Animation"],
      })

      const updated = yield* movies.update(movie.id, { genres: ["Drama"] })

      expect(movie.tags).toEqual(["anime"])
      expect(updated.tags).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("applies matching series rules and manual reapply returns counts", () =>
    Effect.gen(function* () {
      const autoTagging = yield* AutoTaggingService
      const series = yield* SeriesService

      yield* series.add({
        tvdbId: 200,
        title: "Network Show",
        network: "Crunchyroll",
      })
      yield* autoTagging.createRule({
        name: "Crunchyroll",
        mediaType: "series",
        tags: ["anime"],
        specifications: [{ type: "network", value: "Crunchyroll" }],
      })
      const result = yield* autoTagging.applyRules()
      const shows = yield* series.list()

      expect(result.seriesChanged).toBe(0)
      expect(shows[0].tags).toEqual(["anime"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("stores custom filters and registers referenced tags", () =>
    Effect.gen(function* () {
      const autoTagging = yield* AutoTaggingService
      const tags = yield* TagService

      const filter = yield* autoTagging.createCustomFilter({
        type: "movie",
        label: "Anime Wanted",
        filters: {
          tags: ["anime"],
          status: "wanted",
          monitored: true,
        },
      })
      const filters = yield* autoTagging.listCustomFilters()
      const tagRows = yield* tags.list()

      expect(filters.map((row) => row.id)).toEqual([filter.id])
      expect(filters[0].filters).toMatchObject({ tags: ["anime"], status: "wanted" })
      expect(tagRows.find((row) => row.tag.label === "anime")?.usageCount).toBe(1)
    }).pipe(Effect.provide(TestLayer)),
  )
})

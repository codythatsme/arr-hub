import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { TestDbLive } from "#/effect/test/TestDb"

import { SeriesService, SeriesServiceLive } from "./SeriesService"

const TestLayer = SeriesServiceLive.pipe(Layer.provideMerge(TestDbLive))

describe("SeriesService", () => {
  it.effect("add returns series with seasons/episodes", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const result = yield* svc.add({
        tvdbId: 100,
        title: "Test Show",
        seasons: [
          {
            seasonNumber: 1,
            episodes: [
              { tvdbId: 1001, title: "Pilot", episodeNumber: 1 },
              { tvdbId: 1002, title: "Second", episodeNumber: 2 },
            ],
          },
        ],
      })
      expect(typeof result.series.id).toBe("number")
      expect(result.series.tvdbId).toBe(100)
      expect(result.series.title).toBe("Test Show")
      expect(result.series.status).toBe("wanted")
      expect(result.series.monitored).toBe(true)
      expect(result.seasons).toHaveLength(1)
      expect(result.seasons[0].episodes).toHaveLength(2)
      expect(result.seasons[0].episodeCount).toBe(2)
      expect(result.seasons[0].availableCount).toBe(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("add with duplicate tvdbId fails with ConflictError", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      yield* svc.add({ tvdbId: 200, title: "First" })
      const error = yield* Effect.flip(svc.add({ tvdbId: 200, title: "Duplicate" }))
      expect(error._tag).toBe("ConflictError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("add with monitored=false cascades to children", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const result = yield* svc.add({
        tvdbId: 300,
        title: "Unmonitored",
        monitored: false,
        seasons: [
          {
            seasonNumber: 1,
            monitored: true, // should be overridden
            episodes: [{ tvdbId: 3001, title: "Ep1", episodeNumber: 1, monitored: true }],
          },
        ],
      })
      expect(result.series.monitored).toBe(false)
      expect(result.seasons[0].season.monitored).toBe(false)
      expect(result.seasons[0].episodes[0].monitored).toBe(false)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("list returns all series", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      yield* svc.add({ tvdbId: 1, title: "A" })
      yield* svc.add({ tvdbId: 2, title: "B" })
      const all = yield* svc.list()
      expect(all).toHaveLength(2)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("list with status filter", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      yield* svc.add({ tvdbId: 1, title: "Continuing", status: "continuing" })
      yield* svc.add({ tvdbId: 2, title: "Ended", status: "ended" })
      const continuing = yield* svc.list({ status: "continuing" })
      expect(continuing).toHaveLength(1)
      expect(continuing[0].title).toBe("Continuing")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("list with monitored filter", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      yield* svc.add({ tvdbId: 1, title: "Mon", monitored: true })
      yield* svc.add({ tvdbId: 2, title: "Unmon", monitored: false })
      const monitored = yield* svc.list({ monitored: true })
      expect(monitored).toHaveLength(1)
      expect(monitored[0].title).toBe("Mon")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("getById returns full tree", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const added = yield* svc.add({
        tvdbId: 42,
        title: "Find Me",
        seasons: [
          {
            seasonNumber: 1,
            episodes: [{ tvdbId: 4201, title: "Ep1", episodeNumber: 1, hasFile: true }],
          },
        ],
      })
      const found = yield* svc.getById(added.series.id)
      expect(found.series.title).toBe("Find Me")
      expect(found.seasons[0].availableCount).toBe(1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("getById with missing id fails with NotFoundError", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const error = yield* Effect.flip(svc.getById(99999))
      expect(error._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("update changes series fields", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const added = yield* svc.add({ tvdbId: 50, title: "Original" })
      const updated = yield* svc.update(added.series.id, { title: "Updated" })
      expect(updated.series.title).toBe("Updated")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("update with missing id fails with NotFoundError", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const error = yield* Effect.flip(svc.update(99999, { title: "Nope" }))
      expect(error._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("update monitored=false cascades to seasons+episodes", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const added = yield* svc.add({
        tvdbId: 55,
        title: "Cascade Test",
        seasons: [
          {
            seasonNumber: 1,
            episodes: [{ tvdbId: 5501, title: "Ep1", episodeNumber: 1 }],
          },
        ],
      })
      const updated = yield* svc.update(added.series.id, { monitored: false })
      expect(updated.series.monitored).toBe(false)
      expect(updated.seasons[0].season.monitored).toBe(false)
      expect(updated.seasons[0].episodes[0].monitored).toBe(false)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("remove succeeds then getById fails", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const added = yield* svc.add({ tvdbId: 60, title: "Delete Me" })
      yield* svc.remove(added.series.id)
      const error = yield* Effect.flip(svc.getById(added.series.id))
      expect(error._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("remove with missing id fails with NotFoundError", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const error = yield* Effect.flip(svc.remove(99999))
      expect(error._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("lookup matches title substring", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      yield* svc.add({ tvdbId: 1, title: "Breaking Bad" })
      yield* svc.add({ tvdbId: 2, title: "Better Call Saul" })
      yield* svc.add({ tvdbId: 3, title: "The Wire" })
      const results = yield* svc.lookup("B")
      expect(results).toHaveLength(2)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("toggleSeasonMonitor updates season + episodes", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const added = yield* svc.add({
        tvdbId: 70,
        title: "Toggle Test",
        seasons: [
          {
            seasonNumber: 1,
            episodes: [
              { tvdbId: 7001, title: "Ep1", episodeNumber: 1 },
              { tvdbId: 7002, title: "Ep2", episodeNumber: 2 },
            ],
          },
        ],
      })
      const seasonId = added.seasons[0].season.id

      const toggled = yield* svc.toggleSeasonMonitor(seasonId, false)
      expect(toggled.season.monitored).toBe(false)
      expect(toggled.episodes.every((e) => !e.monitored)).toBe(true)

      const restored = yield* svc.toggleSeasonMonitor(seasonId, true)
      expect(restored.season.monitored).toBe(true)
      expect(restored.episodes.every((e) => e.monitored)).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("toggleSeasonMonitor with missing id fails with NotFoundError", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const error = yield* Effect.flip(svc.toggleSeasonMonitor(99999, false))
      expect(error._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("toggleEpisodeMonitor toggles single episode", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const added = yield* svc.add({
        tvdbId: 80,
        title: "Ep Toggle",
        seasons: [
          {
            seasonNumber: 1,
            episodes: [{ tvdbId: 8001, title: "Ep1", episodeNumber: 1 }],
          },
        ],
      })
      const epId = added.seasons[0].episodes[0].id

      const toggled = yield* svc.toggleEpisodeMonitor(epId, false)
      expect(toggled.monitored).toBe(false)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("toggleEpisodeMonitor with missing id fails with NotFoundError", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const error = yield* Effect.flip(svc.toggleEpisodeMonitor(99999, false))
      expect(error._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("calendar returns episodes in date range", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const jan15 = new Date("2026-01-15")
      const feb15 = new Date("2026-02-15")
      const mar15 = new Date("2026-03-15")

      yield* svc.add({
        tvdbId: 90,
        title: "Calendar Show",
        seasons: [
          {
            seasonNumber: 1,
            episodes: [
              { tvdbId: 9001, title: "Jan Ep", episodeNumber: 1, airDate: jan15 },
              { tvdbId: 9002, title: "Feb Ep", episodeNumber: 2, airDate: feb15 },
              { tvdbId: 9003, title: "Mar Ep", episodeNumber: 3, airDate: mar15 },
            ],
          },
        ],
      })

      const results = yield* svc.calendar({
        start: new Date("2026-02-01"),
        end: new Date("2026-02-28"),
      })
      expect(results).toHaveLength(1)
      expect(results[0].episode.title).toBe("Feb Ep")
      expect(results[0].series.title).toBe("Calendar Show")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("calendar excludes unmonitored series", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const feb15 = new Date("2026-02-15")

      yield* svc.add({
        tvdbId: 91,
        title: "Unmonitored Show",
        monitored: false,
        seasons: [
          {
            seasonNumber: 1,
            episodes: [{ tvdbId: 9101, title: "Ep1", episodeNumber: 1, airDate: feb15 }],
          },
        ],
      })

      const results = yield* svc.calendar({
        start: new Date("2026-02-01"),
        end: new Date("2026-02-28"),
      })
      expect(results).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("calendar excludes unmonitored episodes", () =>
    Effect.gen(function* () {
      const svc = yield* SeriesService
      const feb15 = new Date("2026-02-15")

      const added = yield* svc.add({
        tvdbId: 92,
        title: "Partial Monitor",
        seasons: [
          {
            seasonNumber: 1,
            episodes: [
              { tvdbId: 9201, title: "Monitored", episodeNumber: 1, airDate: feb15 },
              {
                tvdbId: 9202,
                title: "Unmonitored",
                episodeNumber: 2,
                airDate: feb15,
                monitored: false,
              },
            ],
          },
        ],
      })

      // sanity check: second episode is unmonitored
      const details = yield* svc.getById(added.series.id)
      const unmEp = details.seasons[0].episodes.find((e) => e.title === "Unmonitored")
      expect(unmEp?.monitored).toBe(false)

      const results = yield* svc.calendar({
        start: new Date("2026-02-01"),
        end: new Date("2026-02-28"),
      })
      expect(results).toHaveLength(1)
      expect(results[0].episode.title).toBe("Monitored")
    }).pipe(Effect.provide(TestLayer)),
  )
})

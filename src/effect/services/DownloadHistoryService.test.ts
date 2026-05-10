import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { TestDbLive } from "#/effect/test/TestDb"

import { DownloadHistoryService, DownloadHistoryServiceLive } from "./DownloadHistoryService"

const TestLayer = DownloadHistoryServiceLive.pipe(Layer.provideMerge(TestDbLive))

describe("DownloadHistoryService", () => {
  it.effect("records and filters download history rows", () =>
    Effect.gen(function* () {
      const history = yield* DownloadHistoryService
      yield* history.record({
        status: "completed",
        mediaKind: "movie",
        movieId: 1,
        mediaTitle: "Example Movie",
        downloadClientId: 2,
        downloadClientName: "qBit",
        externalId: "hash-complete",
        title: "Example.Movie.2024.1080p-GROUP",
        sizeBytes: 1000,
        progress: 1,
      })
      yield* history.record({
        status: "failed",
        mediaKind: "series",
        seriesId: 3,
        downloadClientId: 4,
        downloadClientName: "SAB",
        externalId: "hash-failed",
        title: "Example.Show.S01E01-GROUP",
        errorMessage: "download failed",
      })

      const completed = yield* history.list({ filters: { status: "completed" } })
      const series = yield* history.list({ filters: { mediaKind: "series" } })

      expect(completed.items).toHaveLength(1)
      expect(completed.items[0]?.externalId).toBe("hash-complete")
      expect(series.items).toHaveLength(1)
      expect(series.items[0]?.errorMessage).toBe("download failed")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("paginates newest first", () =>
    Effect.gen(function* () {
      const history = yield* DownloadHistoryService
      yield* history.record({ status: "completed", externalId: "first", title: "First" })
      yield* history.record({ status: "removed", externalId: "second", title: "Second" })

      const firstPage = yield* history.list({ limit: 1 })
      const secondPage = yield* history.list({ limit: 1, cursor: firstPage.nextCursor })

      expect(firstPage.items.map((item) => item.title)).toEqual(["Second"])
      expect(secondPage.items.map((item) => item.title)).toEqual(["First"])
      expect(secondPage.nextCursor).toBeNull()
    }).pipe(Effect.provide(TestLayer)),
  )
})

import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { TestDbLive } from "#/effect/test/TestDb"

import {
  OperationalHistoryService,
  OperationalHistoryServiceLive,
} from "./OperationalHistoryService"

const TestLayer = OperationalHistoryServiceLive.pipe(Layer.provideMerge(TestDbLive))

describe("OperationalHistoryService", () => {
  it.effect("records and filters operational history rows", () =>
    Effect.gen(function* () {
      const history = yield* OperationalHistoryService
      yield* history.record({
        eventType: "grabbed",
        mediaKind: "movie",
        title: "Grabbed Test Movie",
        message: "Grabbed Test.Movie.2024.1080p",
        metadata: { releaseTitle: "Test.Movie.2024.1080p" },
      })
      yield* history.record({
        eventType: "imported",
        mediaKind: "episode",
        title: "Imported Test Show S01E01",
        message: "Imported episode",
      })

      const grabbed = yield* history.list({ filters: { eventType: "grabbed" } })
      const episodes = yield* history.list({ filters: { mediaKind: "episode" } })

      expect(grabbed.items).toHaveLength(1)
      expect(grabbed.items[0]?.title).toBe("Grabbed Test Movie")
      expect(grabbed.items[0]?.metadata).toEqual({ releaseTitle: "Test.Movie.2024.1080p" })
      expect(episodes.items).toHaveLength(1)
      expect(episodes.items[0]?.eventType).toBe("imported")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("paginates newest rows first", () =>
    Effect.gen(function* () {
      const history = yield* OperationalHistoryService
      yield* history.record({ eventType: "grabbed", title: "First", message: "first" })
      yield* history.record({ eventType: "grabbed", title: "Second", message: "second" })

      const firstPage = yield* history.list({ limit: 1 })
      const secondPage = yield* history.list({ limit: 1, cursor: firstPage.nextCursor })

      expect(firstPage.items.map((row) => row.title)).toEqual(["Second"])
      expect(firstPage.nextCursor).not.toBeNull()
      expect(secondPage.items.map((row) => row.title)).toEqual(["First"])
      expect(secondPage.nextCursor).toBeNull()
    }).pipe(Effect.provide(TestLayer)),
  )
})

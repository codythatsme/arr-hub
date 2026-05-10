import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { TestDbLive } from "#/effect/test/TestDb"

import { MovieService, MovieServiceLive } from "./MovieService"
import { TagService, TagServiceLive, normalizeTagLabels } from "./TagService"

const TestLayer = Layer.mergeAll(TagServiceLive, MovieServiceLive).pipe(
  Layer.provideMerge(TestDbLive),
)

describe("TagService", () => {
  it("normalizes tag labels", () => {
    expect(normalizeTagLabels([" anime ", "anime", "HDR  Movies", ""])).toEqual([
      "anime",
      "HDR Movies",
    ])
  })

  it.effect("lists tag usage and blocks deleting used tags", () =>
    Effect.gen(function* () {
      const tags = yield* TagService
      const movies = yield* MovieService

      const created = yield* tags.create("anime")
      yield* movies.add({
        tmdbId: 10,
        title: "Tagged Movie",
        tags: ["anime", "HDR"],
      })

      const rows = yield* tags.list()
      expect(rows.find((row) => row.tag.label === "anime")?.usageCount).toBe(1)
      expect(rows.find((row) => row.tag.label === "HDR")?.usageCount).toBe(1)

      const error = yield* Effect.flip(tags.remove(created.tag.id))
      expect(error._tag).toBe("ValidationError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("deletes unused tags", () =>
    Effect.gen(function* () {
      const tags = yield* TagService
      const created = yield* tags.create("unused")

      yield* tags.remove(created.tag.id)

      const rows = yield* tags.list()
      expect(rows.some((row) => row.tag.label === "unused")).toBe(false)
    }).pipe(Effect.provide(TestLayer)),
  )
})

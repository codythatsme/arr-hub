import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import {
  downloadClients,
  indexers,
  movies as moviesTable,
  notificationChannels,
  series,
} from "#/db/schema"
import { TestDbLive } from "#/effect/test/TestDb"

import { Db } from "./Db"
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

  it.effect("returns compatibility detail ids for tagged records", () =>
    Effect.gen(function* () {
      const tags = yield* TagService
      const db = yield* Db
      const created = yield* tags.create("anime")

      const movieRows = yield* db
        .insert(moviesTable)
        .values({ tmdbId: 11, title: "Movie", tags: ["anime"] })
        .returning({ id: moviesTable.id })
      const seriesRows = yield* db
        .insert(series)
        .values({ tvdbId: 22, title: "Series", tags: ["anime"] })
        .returning({ id: series.id })
      const indexerRows = yield* db
        .insert(indexers)
        .values({
          name: "Indexer",
          type: "torznab",
          baseUrl: "https://indexer.example",
          apiKeyEncrypted: "encrypted",
          tags: ["anime"],
        })
        .returning({ id: indexers.id })
      const downloadClientRows = yield* db
        .insert(downloadClients)
        .values({
          name: "Client",
          type: "qbittorrent",
          host: "localhost",
          port: 8080,
          username: "user",
          passwordEncrypted: "encrypted",
          tags: ["anime"],
        })
        .returning({ id: downloadClients.id })
      const notificationRows = yield* db
        .insert(notificationChannels)
        .values({
          name: "Notify",
          type: "webhook",
          events: [],
          settings: {},
          tags: ["anime"],
        })
        .returning({ id: notificationChannels.id })

      const detail = yield* tags.details(created.tag.id)
      expect(detail.movieIds).toEqual([movieRows[0].id])
      expect(detail.seriesIds).toEqual([seriesRows[0].id])
      expect(detail.indexerIds).toEqual([indexerRows[0].id])
      expect(detail.downloadClientIds).toEqual([downloadClientRows[0].id])
      expect(detail.notificationIds).toEqual([notificationRows[0].id])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("updates assigned tag labels when a tag is renamed", () =>
    Effect.gen(function* () {
      const tags = yield* TagService
      const movies = yield* MovieService

      const created = yield* tags.create("anime")
      const movie = yield* movies.add({
        tmdbId: 33,
        title: "Tagged Movie",
        tags: ["anime", "HDR"],
      })

      const updated = yield* tags.update(created.tag.id, "animation")
      const detail = yield* tags.details(created.tag.id)
      const updatedMovie = yield* movies.getById(movie.id)

      expect(updated.tag.label).toBe("animation")
      expect(updated.usageCount).toBe(1)
      expect(updatedMovie.tags).toEqual(["animation", "HDR"])
      expect(detail.movieIds).toEqual([movie.id])
    }).pipe(Effect.provide(TestLayer)),
  )
})

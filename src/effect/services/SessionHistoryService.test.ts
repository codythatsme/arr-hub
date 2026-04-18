import { SqlClient } from "@effect/sql"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import type { MediaServerSession } from "#/effect/domain/mediaServer"
import { SeriesService, SeriesServiceLive } from "#/effect/services/SeriesService"
import { TestDbLive } from "#/effect/test/TestDb"

import { MovieService, MovieServiceLive } from "./MovieService"
import { SessionHistoryService, SessionHistoryServiceLive } from "./SessionHistoryService"

const TestLayer = SessionHistoryServiceLive.pipe(
  Layer.provideMerge(MovieServiceLive),
  Layer.provideMerge(SeriesServiceLive),
  Layer.provideMerge(TestDbLive),
)

/** Insert a media_servers row directly — avoids pulling CryptoService into the test layer. */
const seedMediaServer = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO media_servers (name, type, host, port, token_encrypted) VALUES ('plex', 'plex', '127.0.0.1', 32400, 'enc:tok')`
  return 1
})

const baseSession = (overrides: Partial<MediaServerSession> = {}): MediaServerSession => ({
  mediaServerId: 1,
  sessionKey: "sk-1",
  ratingKey: "rk-1",
  userId: "u-1",
  username: "alice",
  userThumb: null,
  state: "playing",
  mediaType: "movie",
  title: "The Movie",
  parentTitle: null,
  grandparentTitle: null,
  year: 2024,
  thumb: null,
  viewOffset: 60_000,
  duration: 100_000,
  progressPercent: 60,
  transcodeDecision: "direct_play",
  videoResolution: "1080",
  audioCodec: "aac",
  player: "PlexWeb",
  platform: "Chrome",
  product: "Plex Web",
  ipAddress: "10.0.0.1",
  bandwidth: 5000,
  isLocal: true,
  startedAt: new Date(1_700_000_000_000),
  updatedAt: new Date(1_700_000_060_000),
  tmdbId: null,
  tvdbId: null,
  ...overrides,
})

describe("SessionHistoryService", () => {
  it.effect("writeHistory persists a row with no FK match when GUIDs are null", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const svc = yield* SessionHistoryService
      const rows = yield* svc.writeHistory([baseSession()])
      expect(rows).toHaveLength(1)
      expect(rows[0].title).toBe("The Movie")
      expect(rows[0].movieId).toBeNull()
      expect(rows[0].episodeId).toBeNull()
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("writeHistory links movieId via tmdbId match", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const movies = yield* MovieService
      const movie = yield* movies.add({ tmdbId: 9999, title: "Matched", year: 2024 })

      const svc = yield* SessionHistoryService
      const rows = yield* svc.writeHistory([baseSession({ tmdbId: 9999 })])
      expect(rows[0].movieId).toBe(movie.id)
      expect(rows[0].episodeId).toBeNull()
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("writeHistory links episodeId via tvdbId match", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const seriesSvc = yield* SeriesService
      const added = yield* seriesSvc.add({
        tvdbId: 123,
        title: "Show",
        seasons: [
          {
            seasonNumber: 1,
            episodes: [{ tvdbId: 4242, title: "Pilot", episodeNumber: 1 }],
          },
        ],
      })
      const epId = added.seasons[0].episodes[0].id

      const svc = yield* SessionHistoryService
      const rows = yield* svc.writeHistory([
        baseSession({ mediaType: "episode", tvdbId: 4242, title: "Pilot" }),
      ])
      expect(rows[0].episodeId).toBe(epId)
      expect(rows[0].movieId).toBeNull()
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("writeHistory drops sessions below the watched threshold", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const svc = yield* SessionHistoryService
      const rows = yield* svc.writeHistory([baseSession({ viewOffset: 0, duration: 100_000 })])
      expect(rows).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("writeHistory drops sessions with zero duration", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const svc = yield* SessionHistoryService
      const rows = yield* svc.writeHistory([baseSession({ duration: 0 })])
      expect(rows).toHaveLength(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("listHistory returns rows newest-first with cursor pagination", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const svc = yield* SessionHistoryService
      yield* svc.writeHistory([
        baseSession({ sessionKey: "a", title: "A" }),
        baseSession({ sessionKey: "b", title: "B" }),
        baseSession({ sessionKey: "c", title: "C" }),
      ])

      const page1 = yield* svc.listHistory({ limit: 2 })
      expect(page1.items).toHaveLength(2)
      expect(page1.items[0].title).toBe("C")
      expect(page1.items[1].title).toBe("B")
      expect(page1.nextCursor).not.toBeNull()

      const page2 = yield* svc.listHistory({ limit: 2, cursor: page1.nextCursor })
      expect(page2.items).toHaveLength(1)
      expect(page2.items[0].title).toBe("A")
      expect(page2.nextCursor).toBeNull()
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("listHistory filters by userId and mediaType", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const svc = yield* SessionHistoryService
      yield* svc.writeHistory([
        baseSession({ sessionKey: "a", userId: "alice", mediaType: "movie" }),
        baseSession({ sessionKey: "b", userId: "bob", mediaType: "movie" }),
        baseSession({ sessionKey: "c", userId: "alice", mediaType: "episode" }),
      ])

      const movies = yield* svc.listHistory({ filters: { mediaType: "movie" } })
      expect(movies.items).toHaveLength(2)

      const aliceOnly = yield* svc.listHistory({ filters: { userId: "alice" } })
      expect(aliceOnly.items).toHaveLength(2)

      const aliceMovies = yield* svc.listHistory({
        filters: { userId: "alice", mediaType: "movie" },
      })
      expect(aliceMovies.items).toHaveLength(1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("getHistoryForMedia returns watch events for a movie", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const movies = yield* MovieService
      const movie = yield* movies.add({ tmdbId: 1, title: "Solo", year: 2024 })

      const svc = yield* SessionHistoryService
      yield* svc.writeHistory([
        baseSession({ tmdbId: 1, sessionKey: "a" }),
        baseSession({ tmdbId: 1, sessionKey: "b" }),
        baseSession({ tmdbId: 999, sessionKey: "c" }),
      ])

      const events = yield* svc.getHistoryForMedia({ kind: "movie", movieId: movie.id })
      expect(events).toHaveLength(2)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("getHistoryForMedia returns watch events for an episode", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const seriesSvc = yield* SeriesService
      const added = yield* seriesSvc.add({
        tvdbId: 200,
        title: "Show",
        seasons: [
          {
            seasonNumber: 1,
            episodes: [{ tvdbId: 5000, title: "Pilot", episodeNumber: 1 }],
          },
        ],
      })
      const epId = added.seasons[0].episodes[0].id

      const svc = yield* SessionHistoryService
      yield* svc.writeHistory([
        baseSession({ mediaType: "episode", tvdbId: 5000, sessionKey: "a" }),
      ])

      const events = yield* svc.getHistoryForMedia({ kind: "episode", episodeId: epId })
      expect(events).toHaveLength(1)
    }).pipe(Effect.provide(TestLayer)),
  )
})

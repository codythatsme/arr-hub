import { SqlClient } from "@effect/sql"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import { TestDbLive } from "#/effect/test/TestDb"

import { StatsService, StatsServiceLive } from "./StatsService"

const TestLayer = StatsServiceLive.pipe(Layer.provideMerge(TestDbLive))

const seedMediaServer = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO media_servers (name, type, host, port, token_encrypted) VALUES ('plex', 'plex', '127.0.0.1', 32400, 'enc:tok')`
  return 1
})

/** Insert a history row at a precise stoppedAt + viewOffset — bypasses stoppedAt=now() in writeHistory. */
const insertAt = (overrides: {
  readonly stoppedAt: Date
  readonly viewOffsetMs: number
  readonly mediaType?: "movie" | "episode"
  readonly title?: string
  readonly grandparentTitle?: string | null
  readonly transcodeDecision?: "direct_play" | "direct_stream" | "transcode"
  readonly userId?: string
  readonly username?: string
  readonly mediaServerId?: number
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const epoch = Math.floor(overrides.stoppedAt.getTime() / 1000)
    yield* sql`INSERT INTO session_history (
      media_server_id, plex_user_id, plex_username, rating_key, media_type, title,
      parent_title, grandparent_title, year, thumb, started_at, stopped_at, duration,
      view_offset, paused_duration_sec, transcode_decision, video_resolution, audio_codec,
      player, platform, product, ip_address, bandwidth, is_local
    ) VALUES (
      ${overrides.mediaServerId ?? 1},
      ${overrides.userId ?? "u-1"},
      ${overrides.username ?? "alice"},
      'rk',
      ${overrides.mediaType ?? "movie"},
      ${overrides.title ?? "Title"},
      NULL,
      ${overrides.grandparentTitle ?? null},
      2024,
      NULL,
      ${epoch - 60},
      ${epoch},
      ${overrides.viewOffsetMs * 2},
      ${overrides.viewOffsetMs},
      0,
      ${overrides.transcodeDecision ?? "direct_play"},
      '1080',
      'aac',
      'PlexWeb',
      'Chrome',
      'Plex',
      '10.0.0.1',
      5000,
      1
    )`
  })

const range = (startMs: number, endMs: number) => ({
  start: new Date(startMs),
  end: new Date(endMs),
})

describe("StatsService", () => {
  it.effect("getPlaysByDay buckets by UTC day with movie/episode split", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      // Use mid-day UTC timestamps to avoid TZ flakiness on day boundaries
      const day1 = new Date("2024-06-01T12:00:00Z").getTime()
      const day2 = new Date("2024-06-02T12:00:00Z").getTime()

      yield* insertAt({ stoppedAt: new Date(day1), viewOffsetMs: 60_000, mediaType: "movie" })
      yield* insertAt({ stoppedAt: new Date(day1), viewOffsetMs: 30_000, mediaType: "movie" })
      yield* insertAt({ stoppedAt: new Date(day1), viewOffsetMs: 45_000, mediaType: "episode" })
      yield* insertAt({ stoppedAt: new Date(day2), viewOffsetMs: 60_000, mediaType: "episode" })

      const svc = yield* StatsService
      const buckets = yield* svc.getPlaysByDay(
        range(
          new Date("2024-06-01T00:00:00Z").getTime(),
          new Date("2024-06-03T00:00:00Z").getTime(),
        ),
      )
      expect(buckets).toHaveLength(2)
      expect(buckets[0].date).toBe("2024-06-01")
      expect(buckets[0].movies).toBe(2)
      expect(buckets[0].episodes).toBe(1)
      expect(buckets[0].total).toBe(3)
      expect(buckets[1].date).toBe("2024-06-02")
      expect(buckets[1].episodes).toBe(1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("getWatchTimeByDay sums viewOffset converted to seconds", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const day1 = new Date("2024-06-01T12:00:00Z")
      yield* insertAt({ stoppedAt: day1, viewOffsetMs: 60_000 })
      yield* insertAt({ stoppedAt: day1, viewOffsetMs: 90_000 })

      const svc = yield* StatsService
      const buckets = yield* svc.getWatchTimeByDay(
        range(
          new Date("2024-06-01T00:00:00Z").getTime(),
          new Date("2024-06-02T00:00:00Z").getTime(),
        ),
      )
      expect(buckets).toHaveLength(1)
      expect(buckets[0].seconds).toBe(150)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("getTopMedia ranks by plays and groups episodes by series", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const t = new Date("2024-06-01T12:00:00Z")
      yield* insertAt({ stoppedAt: t, viewOffsetMs: 60_000, mediaType: "movie", title: "Movie A" })
      yield* insertAt({ stoppedAt: t, viewOffsetMs: 60_000, mediaType: "movie", title: "Movie B" })
      yield* insertAt({
        stoppedAt: t,
        viewOffsetMs: 60_000,
        mediaType: "episode",
        title: "S01E01",
        grandparentTitle: "Show X",
      })
      yield* insertAt({
        stoppedAt: t,
        viewOffsetMs: 60_000,
        mediaType: "episode",
        title: "S01E02",
        grandparentTitle: "Show X",
      })

      const svc = yield* StatsService
      const top = yield* svc.getTopMedia({
        range: range(
          new Date("2024-06-01T00:00:00Z").getTime(),
          new Date("2024-06-02T00:00:00Z").getTime(),
        ),
      })
      expect(top[0].title).toBe("Show X")
      expect(top[0].playCount).toBe(2)
      expect(top.find((m) => m.title === "Movie A")?.playCount).toBe(1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("getTopMedia sort=duration orders by total watched ms", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const t = new Date("2024-06-01T12:00:00Z")
      yield* insertAt({ stoppedAt: t, viewOffsetMs: 10_000, title: "Short" })
      yield* insertAt({ stoppedAt: t, viewOffsetMs: 10_000, title: "Short" })
      yield* insertAt({ stoppedAt: t, viewOffsetMs: 1_000_000, title: "Long" })

      const svc = yield* StatsService
      const top = yield* svc.getTopMedia({
        range: range(
          new Date("2024-06-01T00:00:00Z").getTime(),
          new Date("2024-06-02T00:00:00Z").getTime(),
        ),
        sort: "duration",
      })
      expect(top[0].title).toBe("Long")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("getTopUsers ranks users by play count", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const t = new Date("2024-06-01T12:00:00Z")
      yield* insertAt({ stoppedAt: t, viewOffsetMs: 60_000, userId: "1", username: "alice" })
      yield* insertAt({ stoppedAt: t, viewOffsetMs: 60_000, userId: "1", username: "alice" })
      yield* insertAt({ stoppedAt: t, viewOffsetMs: 60_000, userId: "2", username: "bob" })

      const svc = yield* StatsService
      const top = yield* svc.getTopUsers({
        range: range(
          new Date("2024-06-01T00:00:00Z").getTime(),
          new Date("2024-06-02T00:00:00Z").getTime(),
        ),
      })
      expect(top[0].plexUsername).toBe("alice")
      expect(top[0].playCount).toBe(2)
      expect(top[1].plexUsername).toBe("bob")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("getStreamTypeDistribution counts each transcode_decision bucket", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const t = new Date("2024-06-01T12:00:00Z")
      yield* insertAt({ stoppedAt: t, viewOffsetMs: 60_000, transcodeDecision: "direct_play" })
      yield* insertAt({ stoppedAt: t, viewOffsetMs: 60_000, transcodeDecision: "direct_play" })
      yield* insertAt({ stoppedAt: t, viewOffsetMs: 60_000, transcodeDecision: "direct_stream" })
      yield* insertAt({ stoppedAt: t, viewOffsetMs: 60_000, transcodeDecision: "transcode" })

      const svc = yield* StatsService
      const dist = yield* svc.getStreamTypeDistribution(
        range(
          new Date("2024-06-01T00:00:00Z").getTime(),
          new Date("2024-06-02T00:00:00Z").getTime(),
        ),
      )
      expect(dist.directPlay).toBe(2)
      expect(dist.directStream).toBe(1)
      expect(dist.transcode).toBe(1)
      expect(dist.total).toBe(4)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("getPlaysByHourOfDay returns 24 buckets even when sparse", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      yield* insertAt({ stoppedAt: new Date("2024-06-01T03:30:00Z"), viewOffsetMs: 60_000 })
      yield* insertAt({ stoppedAt: new Date("2024-06-01T20:15:00Z"), viewOffsetMs: 60_000 })
      yield* insertAt({ stoppedAt: new Date("2024-06-01T20:45:00Z"), viewOffsetMs: 60_000 })

      const svc = yield* StatsService
      const buckets = yield* svc.getPlaysByHourOfDay(
        range(
          new Date("2024-06-01T00:00:00Z").getTime(),
          new Date("2024-06-02T00:00:00Z").getTime(),
        ),
      )
      expect(buckets).toHaveLength(24)
      expect(buckets[3].playCount).toBe(1)
      expect(buckets[20].playCount).toBe(2)
      expect(buckets[0].playCount).toBe(0)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("filters limit results to selected mediaType + user + server", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      // Add a second media server row
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO media_servers (name, type, host, port, token_encrypted) VALUES ('plex2', 'plex', '127.0.0.1', 32401, 'enc:tok2')`

      const t = new Date("2024-06-01T12:00:00Z")
      yield* insertAt({ stoppedAt: t, viewOffsetMs: 60_000, mediaType: "movie", userId: "alice" })
      yield* insertAt({
        stoppedAt: t,
        viewOffsetMs: 60_000,
        mediaType: "episode",
        userId: "alice",
      })
      yield* insertAt({ stoppedAt: t, viewOffsetMs: 60_000, mediaType: "movie", userId: "bob" })
      yield* insertAt({
        stoppedAt: t,
        viewOffsetMs: 60_000,
        mediaType: "movie",
        mediaServerId: 2,
      })

      const svc = yield* StatsService
      const r = range(
        new Date("2024-06-01T00:00:00Z").getTime(),
        new Date("2024-06-02T00:00:00Z").getTime(),
      )

      const aliceMovies = yield* svc.getPlaysByDay(r, { userId: "alice", mediaType: "movie" })
      expect(aliceMovies[0].total).toBe(1)

      const server2 = yield* svc.getPlaysByDay(r, { mediaServerId: 2 })
      expect(server2[0].total).toBe(1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("range filter excludes rows outside [start, end]", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      yield* insertAt({ stoppedAt: new Date("2024-05-31T12:00:00Z"), viewOffsetMs: 60_000 })
      yield* insertAt({ stoppedAt: new Date("2024-06-01T12:00:00Z"), viewOffsetMs: 60_000 })
      yield* insertAt({ stoppedAt: new Date("2024-06-05T12:00:00Z"), viewOffsetMs: 60_000 })

      const svc = yield* StatsService
      const dist = yield* svc.getStreamTypeDistribution(
        range(
          new Date("2024-06-01T00:00:00Z").getTime(),
          new Date("2024-06-02T00:00:00Z").getTime(),
        ),
      )
      expect(dist.total).toBe(1)
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("empty range returns empty arrays / zero distribution", () =>
    Effect.gen(function* () {
      yield* seedMediaServer
      const svc = yield* StatsService
      const r = range(
        new Date("2024-06-01T00:00:00Z").getTime(),
        new Date("2024-06-02T00:00:00Z").getTime(),
      )

      const days = yield* svc.getPlaysByDay(r)
      const watch = yield* svc.getWatchTimeByDay(r)
      const top = yield* svc.getTopMedia({ range: r })
      const users = yield* svc.getTopUsers({ range: r })
      const dist = yield* svc.getStreamTypeDistribution(r)
      const hours = yield* svc.getPlaysByHourOfDay(r)

      expect(days).toEqual([])
      expect(watch).toEqual([])
      expect(top).toEqual([])
      expect(users).toEqual([])
      expect(dist).toEqual({ directPlay: 0, directStream: 0, transcode: 0, total: 0 })
      expect(hours).toHaveLength(24)
      expect(hours.every((h) => h.playCount === 0)).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )
})

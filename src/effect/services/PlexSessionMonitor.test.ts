import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import type { MediaServerSession } from "#/effect/domain/mediaServer"
import { AdapterRegistryLive } from "#/effect/services/AdapterRegistry"
import { CryptoServiceLive } from "#/effect/services/CryptoService"
import { MediaServerService, MediaServerServiceLive } from "#/effect/services/MediaServerService"
import { SessionHistoryServiceLive } from "#/effect/services/SessionHistoryService"
import { TestDbLive } from "#/effect/test/TestDb"

import {
  buildWsUrl,
  isPlayingNotification,
  PlexSessionMonitor,
  PlexSessionMonitorLive,
  reconcileSessions,
  snapshotSessions,
} from "./PlexSessionMonitor"

// ── Pure helper unit tests ──

const mkSession = (sessionKey: string, serverId = 1): MediaServerSession => ({
  mediaServerId: serverId,
  sessionKey,
  ratingKey: `rk-${sessionKey}`,
  userId: "u1",
  username: "alice",
  userThumb: null,
  state: "playing",
  mediaType: "movie",
  title: `Title ${sessionKey}`,
  parentTitle: null,
  grandparentTitle: null,
  year: 2024,
  thumb: null,
  viewOffset: 0,
  duration: 100,
  progressPercent: 0,
  transcodeDecision: "direct_play",
  videoResolution: "1080",
  audioCodec: "aac",
  player: "PlexWeb",
  platform: "Chrome",
  product: "Plex Web",
  ipAddress: null,
  bandwidth: null,
  isLocal: true,
  startedAt: new Date(0),
  updatedAt: new Date(0),
  tmdbId: null,
  tvdbId: null,
})

describe("reconcileSessions", () => {
  it("seeds sessions when prev is empty", () => {
    const { map, stopped } = reconcileSessions(new Map(), 1, [mkSession("a"), mkSession("b")])
    expect(stopped).toEqual([])
    expect(map.get(1)?.size).toBe(2)
  })

  it("detects sessions removed from next as stopped", () => {
    const prev = new Map([
      [
        1,
        new Map([
          ["a", mkSession("a")],
          ["b", mkSession("b")],
        ]),
      ],
    ])
    const { stopped } = reconcileSessions(prev, 1, [mkSession("a")])
    expect(stopped.map((s) => s.sessionKey)).toEqual(["b"])
  })

  it("scopes reconciliation per server", () => {
    const prev = new Map([
      [1, new Map([["a", mkSession("a", 1)]])],
      [2, new Map([["x", mkSession("x", 2)]])],
    ])
    const { map, stopped } = reconcileSessions(prev, 1, [])
    expect(stopped.map((s) => s.sessionKey)).toEqual(["a"])
    expect(map.get(2)?.size).toBe(1)
    expect(map.get(1)?.size).toBe(0)
  })

  it("upserts existing keys with new state", () => {
    const prev = new Map([[1, new Map([["a", { ...mkSession("a"), state: "playing" as const }]])]])
    const updated: MediaServerSession = { ...mkSession("a"), state: "paused" }
    const { map, stopped } = reconcileSessions(prev, 1, [updated])
    expect(stopped).toEqual([])
    expect(map.get(1)?.get("a")?.state).toBe("paused")
  })
})

describe("snapshotSessions", () => {
  it("flattens all servers into one array", () => {
    const state = new Map([
      [1, new Map([["a", mkSession("a", 1)]])],
      [
        2,
        new Map([
          ["x", mkSession("x", 2)],
          ["y", mkSession("y", 2)],
        ]),
      ],
    ])
    expect(snapshotSessions(state)).toHaveLength(3)
  })
})

describe("buildWsUrl", () => {
  it("uses ws:// when useSsl is false", () => {
    expect(buildWsUrl({ host: "192.168.1.5", port: 32400, useSsl: false, token: "tok" })).toBe(
      "ws://192.168.1.5:32400/:/websockets/notifications?X-Plex-Token=tok",
    )
  })

  it("uses wss:// when useSsl is true", () => {
    expect(buildWsUrl({ host: "h", port: 1, useSsl: true, token: "t" })).toMatch(/^wss:/)
  })

  it("URL-encodes the token", () => {
    expect(buildWsUrl({ host: "h", port: 1, useSsl: false, token: "a/b+c" })).toContain(
      "X-Plex-Token=a%2Fb%2Bc",
    )
  })
})

describe("isPlayingNotification", () => {
  it("accepts a playing event with a state notification", () => {
    const raw = JSON.stringify({
      NotificationContainer: {
        type: "playing",
        PlaySessionStateNotification: [{ sessionKey: "1", state: "playing" }],
      },
    })
    expect(isPlayingNotification(raw)).toBe(true)
  })

  it("rejects non-playing event types", () => {
    const raw = JSON.stringify({
      NotificationContainer: { type: "timeline", TimelineEntry: [{}] },
    })
    expect(isPlayingNotification(raw)).toBe(false)
  })

  it("rejects malformed JSON", () => {
    expect(isPlayingNotification("not json")).toBe(false)
  })

  it("rejects playing event with no notifications", () => {
    const raw = JSON.stringify({
      NotificationContainer: { type: "playing", PlaySessionStateNotification: [] },
    })
    expect(isPlayingNotification(raw)).toBe(false)
  })
})

// ── Service lifecycle tests ──

const TestLayer = PlexSessionMonitorLive.pipe(
  Layer.provideMerge(MediaServerServiceLive),
  Layer.provideMerge(SessionHistoryServiceLive),
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(AdapterRegistryLive),
  Layer.provideMerge(TestDbLive),
)

describe("PlexSessionMonitor service", () => {
  it.scoped("getActive returns [] when no servers monitored", () =>
    Effect.gen(function* () {
      const monitor = yield* PlexSessionMonitor
      expect(yield* monitor.getActive()).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.scoped("start fails for unknown server", () =>
    Effect.gen(function* () {
      const monitor = yield* PlexSessionMonitor
      const error = yield* Effect.flip(monitor.start(99999))
      expect(error._tag).toBe("NotFoundError")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.scoped("startAllEnabled is no-op when no monitoring-enabled servers exist", () =>
    Effect.gen(function* () {
      const monitor = yield* PlexSessionMonitor
      yield* monitor.startAllEnabled()
      expect(yield* monitor.getActive()).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.scoped("startAllEnabled skips servers with monitoringEnabled=false", () =>
    Effect.gen(function* () {
      const svc = yield* MediaServerService
      yield* svc.add({
        name: "Plex Off",
        type: "plex",
        host: "127.0.0.1",
        port: 32400,
        token: "tok",
        settings: { syncIntervalMs: 60000, monitoringEnabled: false },
      })
      const monitor = yield* PlexSessionMonitor
      yield* monitor.startAllEnabled()
      // Nothing started → still empty after stopAll for cleanup.
      expect(yield* monitor.getActive()).toEqual([])
      yield* monitor.stopAll()
    }).pipe(Effect.provide(TestLayer)),
  )

  it.scoped("getActiveForServer returns [] for unknown server id", () =>
    Effect.gen(function* () {
      const monitor = yield* PlexSessionMonitor
      expect(yield* monitor.getActiveForServer(42)).toEqual([])
    }).pipe(Effect.provide(TestLayer)),
  )
})

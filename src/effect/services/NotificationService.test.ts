import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

import type { MediaServerSession } from "#/effect/domain/mediaServer"
import { MonitoringTriggerBusLive } from "#/effect/services/MonitoringTriggerBus"
import { TestDbLive } from "#/effect/test/TestDb"

import { NotificationService, NotificationServiceLive } from "./NotificationService"

const TestLayer = NotificationServiceLive.pipe(
  Layer.provideMerge(MonitoringTriggerBusLive),
  Layer.provideMerge(TestDbLive),
)

const session: MediaServerSession = {
  mediaServerId: 1,
  sessionKey: "abc",
  ratingKey: "movie-1",
  userId: "user-1",
  username: "Casey",
  userThumb: null,
  state: "playing",
  mediaType: "movie",
  title: "Arrival",
  parentTitle: null,
  grandparentTitle: null,
  year: 2016,
  thumb: null,
  viewOffset: 1_000,
  duration: 10_000,
  progressPercent: 10,
  transcodeDecision: "direct_play",
  videoResolution: "1080",
  audioCodec: "aac",
  player: "Plex Web",
  platform: "Chrome",
  product: "Plex Web",
  ipAddress: "127.0.0.1",
  bandwidth: 4_000,
  isLocal: true,
  startedAt: new Date("2026-05-04T00:00:00.000Z"),
  updatedAt: new Date("2026-05-04T00:00:05.000Z"),
  tmdbId: 329865,
  tvdbId: null,
}

describe("NotificationService", () => {
  it.effect("creates channels with default event subscriptions", () =>
    Effect.gen(function* () {
      const service = yield* NotificationService
      const channel = yield* service.createChannel({
        name: "Ops",
        type: "in_app",
        enabled: true,
        events: [],
        settings: {},
      })

      expect(channel.name).toBe("Ops")
      expect(channel.events).toContain("session_start")
      expect(channel.events).toContain("server_down")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("records sent deliveries for subscribed channels", () =>
    Effect.gen(function* () {
      const service = yield* NotificationService
      yield* service.createChannel({
        name: "Stream alerts",
        type: "in_app",
        enabled: true,
        events: ["session_start"],
        settings: {},
      })

      yield* service.deliverTrigger({ kind: "session_start", session })
      const deliveries = yield* service.listDeliveries()

      expect(deliveries).toHaveLength(1)
      expect(deliveries[0].event).toBe("session_start")
      expect(deliveries[0].status).toBe("sent")
      expect(deliveries[0].message).toContain("Casey started Arrival")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("records skipped delivery when no channel subscribes", () =>
    Effect.gen(function* () {
      const service = yield* NotificationService
      yield* service.deliverTrigger({
        kind: "server_down",
        serverId: 1,
        serverName: "Plex",
      })

      const deliveries = yield* service.listDeliveries()

      expect(deliveries).toHaveLength(1)
      expect(deliveries[0].event).toBe("server_down")
      expect(deliveries[0].status).toBe("skipped")
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("updates channel event subscriptions", () =>
    Effect.gen(function* () {
      const service = yield* NotificationService
      const channel = yield* service.createChannel({
        name: "Scoped alerts",
        type: "in_app",
        enabled: true,
        events: ["session_start", "server_down"],
        settings: {},
      })

      const updated = yield* service.updateChannel(channel.id, {
        events: ["media_watched"],
      })

      expect(updated.events).toEqual(["media_watched"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("sends test deliveries directly to a channel", () =>
    Effect.gen(function* () {
      const service = yield* NotificationService
      const channel = yield* service.createChannel({
        name: "Disabled alerts",
        type: "in_app",
        enabled: false,
        events: ["session_start"],
        settings: {},
      })

      const delivery = yield* service.testChannel(channel.id, "server_down")

      expect(delivery.channelId).toBe(channel.id)
      expect(delivery.event).toBe("server_down")
      expect(delivery.status).toBe("sent")
      expect(delivery.payload.test).toBe(true)
    }).pipe(Effect.provide(TestLayer)),
  )
})

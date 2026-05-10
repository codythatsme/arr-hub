import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { afterEach, vi } from "vitest"

import type { MediaServerSession } from "#/effect/domain/mediaServer"
import { MonitoringTriggerBusLive } from "#/effect/services/MonitoringTriggerBus"
import { TestDbLive } from "#/effect/test/TestDb"

import { NotificationService, NotificationServiceLive } from "./NotificationService"

const TestLayer = NotificationServiceLive.pipe(
  Layer.provideMerge(MonitoringTriggerBusLive),
  Layer.provideMerge(TestDbLive),
)

function stubSuccessfulFetch() {
  const fetchSpy = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
  )
  vi.stubGlobal("fetch", fetchSpy)
  return fetchSpy
}

function getFetchInit(fetchSpy: ReturnType<typeof stubSuccessfulFetch>): RequestInit {
  const init = fetchSpy.mock.calls[0]?.[1]
  expect(init).toBeDefined()
  return init as RequestInit
}

function getFetchBody(fetchSpy: ReturnType<typeof stubSuccessfulFetch>): Record<string, unknown> {
  const init = getFetchInit(fetchSpy)
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it.effect("records operational event deliveries for subscribed channels", () =>
    Effect.gen(function* () {
      const service = yield* NotificationService
      yield* service.createChannel({
        name: "Ops",
        type: "in_app",
        enabled: true,
        events: ["grabbed"],
        settings: {},
      })

      yield* service.deliverTrigger({
        kind: "operational",
        event: "grabbed",
        title: "Release grabbed",
        message: "Example.Release.2026 was grabbed",
        payload: { releaseTitle: "Example.Release.2026" },
      })
      const deliveries = yield* service.listDeliveries()

      expect(deliveries).toHaveLength(1)
      expect(deliveries[0].event).toBe("grabbed")
      expect(deliveries[0].status).toBe("sent")
      expect(deliveries[0].message).toContain("Example.Release.2026")
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

  it.effect("keeps custom webhook deliveries in the generic payload shape", () => {
    const fetchSpy = stubSuccessfulFetch()

    return Effect.gen(function* () {
      const service = yield* NotificationService
      const channel = yield* service.createChannel({
        name: "Webhook",
        type: "webhook",
        enabled: true,
        events: ["server_down"],
        settings: { url: "https://webhook.example/arr-hub" },
      })

      const delivery = yield* service.testChannel(channel.id, "server_down")

      expect(delivery.status).toBe("sent")
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://webhook.example/arr-hub",
        expect.objectContaining({ method: "POST" }),
      )
      expect(getFetchBody(fetchSpy)).toMatchObject({
        event: "server_down",
        title: "Test media server offline",
        message: "Example Server is not responding",
        payload: { test: true },
      })
    }).pipe(Effect.provide(TestLayer))
  })

  it.effect("formats Discord webhook deliveries", () => {
    const fetchSpy = stubSuccessfulFetch()

    return Effect.gen(function* () {
      const service = yield* NotificationService
      const channel = yield* service.createChannel({
        name: "Discord",
        type: "discord",
        enabled: true,
        events: ["server_down"],
        settings: { url: "https://discord.example/webhook" },
      })

      const delivery = yield* service.testChannel(channel.id, "server_down")
      const body = getFetchBody(fetchSpy)

      expect(delivery.status).toBe("sent")
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://discord.example/webhook",
        expect.objectContaining({ method: "POST" }),
      )
      expect(body).toMatchObject({
        username: "ARR Hub",
        embeds: [
          {
            title: "Test media server offline",
            description: "Example Server is not responding",
            fields: [{ name: "Event", value: "server down", inline: true }],
          },
        ],
      })
    }).pipe(Effect.provide(TestLayer))
  })

  it.effect("formats Slack webhook deliveries", () => {
    const fetchSpy = stubSuccessfulFetch()

    return Effect.gen(function* () {
      const service = yield* NotificationService
      const channel = yield* service.createChannel({
        name: "Slack",
        type: "slack",
        enabled: true,
        events: ["server_down"],
        settings: { url: "https://slack.example/webhook" },
      })

      const delivery = yield* service.testChannel(channel.id, "server_down")
      const body = getFetchBody(fetchSpy)

      expect(delivery.status).toBe("sent")
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://slack.example/webhook",
        expect.objectContaining({ method: "POST" }),
      )
      expect(body).toMatchObject({
        text: "Test media server offline\nExample Server is not responding",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Test media server offline*\nExample Server is not responding",
            },
          },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: "Event: `server_down`" }],
          },
        ],
      })
    }).pipe(Effect.provide(TestLayer))
  })

  it.effect("formats Ntfy topic deliveries", () => {
    const fetchSpy = stubSuccessfulFetch()

    return Effect.gen(function* () {
      const service = yield* NotificationService
      const channel = yield* service.createChannel({
        name: "Ntfy",
        type: "ntfy",
        enabled: true,
        events: ["server_down"],
        settings: { url: "https://ntfy.example/arr-hub" },
      })

      const delivery = yield* service.testChannel(channel.id, "server_down")
      const init = getFetchInit(fetchSpy)

      expect(delivery.status).toBe("sent")
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://ntfy.example/arr-hub",
        expect.objectContaining({ method: "POST" }),
      )
      expect(init.headers).toMatchObject({
        "content-type": "text/plain; charset=utf-8",
        title: "Test media server offline",
        tags: "warning",
        priority: "4",
      })
      expect(init.body).toBe("Example Server is not responding")
    }).pipe(Effect.provide(TestLayer))
  })

  it.effect("formats Gotify message deliveries", () => {
    const fetchSpy = stubSuccessfulFetch()

    return Effect.gen(function* () {
      const service = yield* NotificationService
      const channel = yield* service.createChannel({
        name: "Gotify",
        type: "gotify",
        enabled: true,
        events: ["server_down"],
        settings: { url: "https://gotify.example/message?token=app-token" },
      })

      const delivery = yield* service.testChannel(channel.id, "server_down")
      const body = getFetchBody(fetchSpy)

      expect(delivery.status).toBe("sent")
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://gotify.example/message?token=app-token",
        expect.objectContaining({ method: "POST" }),
      )
      expect(body).toMatchObject({
        title: "Test media server offline",
        message: "Example Server is not responding",
        priority: 8,
      })
    }).pipe(Effect.provide(TestLayer))
  })

  it.effect("formats Telegram sendMessage deliveries", () => {
    const fetchSpy = stubSuccessfulFetch()

    return Effect.gen(function* () {
      const service = yield* NotificationService
      yield* service.createChannel({
        name: "Telegram",
        type: "telegram",
        enabled: true,
        events: ["grabbed"],
        settings: { url: "https://api.telegram.example/bot-token/sendMessage?chat_id=1234" },
      })

      yield* service.deliverTrigger({
        kind: "operational",
        event: "grabbed",
        title: "Release <grabbed> & queued",
        message: "Movie > Series & more",
        payload: { releaseTitle: "Example.Release.2026" },
      })
      const body = getFetchBody(fetchSpy)

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.telegram.example/bot-token/sendMessage?chat_id=1234",
        expect.objectContaining({ method: "POST" }),
      )
      expect(body).toMatchObject({
        text: "<b>Release &lt;grabbed&gt; &amp; queued</b>\nMovie &gt; Series &amp; more",
        parse_mode: "HTML",
        disable_web_page_preview: true,
      })
    }).pipe(Effect.provide(TestLayer))
  })

  it.effect("formats Pushover message deliveries", () => {
    const fetchSpy = stubSuccessfulFetch()

    return Effect.gen(function* () {
      const service = yield* NotificationService
      const channel = yield* service.createChannel({
        name: "Pushover",
        type: "pushover",
        enabled: true,
        events: ["server_down"],
        settings: { token: "app-token", user: "user-key" },
      })

      const delivery = yield* service.testChannel(channel.id, "server_down")
      const init = getFetchInit(fetchSpy)
      const body = new URLSearchParams(String(init.body))

      expect(delivery.status).toBe("sent")
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.pushover.net/1/messages.json",
        expect.objectContaining({ method: "POST" }),
      )
      expect(init.headers).toMatchObject({
        "content-type": "application/x-www-form-urlencoded",
      })
      expect(Object.fromEntries(body)).toMatchObject({
        token: "app-token",
        user: "user-key",
        title: "Test media server offline",
        message: "Example Server is not responding",
        priority: "1",
      })
    }).pipe(Effect.provide(TestLayer))
  })

  it.effect("requires Pushover credentials", () =>
    Effect.gen(function* () {
      const service = yield* NotificationService
      const result = yield* Effect.either(
        service.createChannel({
          name: "Pushover",
          type: "pushover",
          enabled: true,
          events: ["server_down"],
          settings: { token: "app-token" },
        }),
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left.message).toBe("Pushover token and user key are required")
      }
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("requires URLs for provider-backed webhook channels", () =>
    Effect.gen(function* () {
      const service = yield* NotificationService
      const result = yield* Effect.either(
        service.createChannel({
          name: "Slack",
          type: "slack",
          enabled: true,
          events: ["server_down"],
          settings: {},
        }),
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left.message).toBe("Slack webhook url is required")
      }
    }).pipe(Effect.provide(TestLayer)),
  )
})

import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import * as net from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { afterEach, vi } from "vitest"

import type { MediaServerSession } from "#/effect/domain/mediaServer"
import { MonitoringTriggerBusLive } from "#/effect/services/MonitoringTriggerBus"
import { TestDbLive } from "#/effect/test/TestDb"

import { NotificationService, NotificationServiceLive } from "./NotificationService"
import { TagService, TagServiceLive } from "./TagService"

const TestLayer = Layer.mergeAll(NotificationServiceLive, TagServiceLive).pipe(
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

async function startFakeSmtpServer(): Promise<{
  readonly port: number
  readonly commands: Array<string>
  readonly messages: Array<string>
  readonly close: () => Promise<void>
}> {
  const commands: Array<string> = []
  const messages: Array<string> = []
  const server = net.createServer((socket) => {
    let buffer = ""
    let inData = false
    let messageLines: Array<string> = []

    socket.setEncoding("utf8")
    socket.write("220 arr-hub test smtp\r\n")
    socket.on("data", (chunk) => {
      buffer += chunk
      while (true) {
        const index = buffer.indexOf("\n")
        if (index === -1) break

        const line = buffer.slice(0, index).replace(/\r$/, "")
        buffer = buffer.slice(index + 1)

        if (inData) {
          if (line === ".") {
            messages.push(messageLines.join("\n"))
            messageLines = []
            inData = false
            socket.write("250 queued\r\n")
          } else {
            messageLines.push(line)
          }
          continue
        }

        commands.push(line)
        const upper = line.toUpperCase()
        if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
          socket.write("250-localhost\r\n250 AUTH PLAIN\r\n")
        } else if (upper.startsWith("MAIL FROM:") || upper.startsWith("RCPT TO:")) {
          socket.write("250 ok\r\n")
        } else if (upper === "DATA") {
          inData = true
          socket.write("354 end with dot\r\n")
        } else if (upper === "QUIT") {
          socket.write("221 bye\r\n")
          socket.end()
        } else {
          socket.write("250 ok\r\n")
        }
      }
    })
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening)
      reject(error)
    }
    const onListening = () => {
      server.off("error", onError)
      resolve()
    }

    server.once("error", onError)
    server.listen(0, "127.0.0.1", onListening)
  })
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("fake SMTP server did not bind to a TCP port")
  }

  return {
    port: address.port,
    commands,
    messages,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      }),
  }
}

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

  it.effect("normalizes and registers notification channel tags", () =>
    Effect.gen(function* () {
      const service = yield* NotificationService
      const tags = yield* TagService
      const channel = yield* service.createChannel({
        name: "Tagged alerts",
        type: "in_app",
        enabled: true,
        events: ["server_down"],
        settings: {},
        tags: [" ops ", "ops", "critical"],
      })

      expect(channel.tags).toEqual(["ops", "critical"])
      const rows = yield* tags.list()
      expect(rows.find((row) => row.tag.label === "ops")?.usageCount).toBe(1)
      expect(rows.find((row) => row.tag.label === "critical")?.usageCount).toBe(1)

      const updated = yield* service.updateChannel(channel.id, { tags: ["alerts"] })
      expect(updated.tags).toEqual(["alerts"])
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("redacts notification channel secrets from returned channels", () =>
    Effect.gen(function* () {
      const service = yield* NotificationService
      const webhook = yield* service.createChannel({
        name: "Webhook",
        type: "webhook",
        enabled: true,
        events: ["server_down"],
        settings: {
          url: "https://hooks.example/secret-webhook-token",
          headers: { Authorization: "Bearer secret-header-token" },
        },
      })
      yield* service.createChannel({
        name: "Pushover",
        type: "pushover",
        enabled: true,
        events: ["server_down"],
        settings: { token: "secret-pushover-token", user: "secret-pushover-user" },
      })
      yield* service.createChannel({
        name: "Email",
        type: "email",
        enabled: true,
        events: ["server_down"],
        settings: {
          smtpHost: "smtp.example.com",
          smtpPort: 587,
          smtpSecurity: "starttls",
          smtpUsername: "alerts@example.com",
          smtpPassword: "secret-smtp-password",
          fromEmail: "alerts@example.com",
          toEmails: ["ops@example.com"],
        },
      })

      const channels = yield* service.listChannels()
      const json = JSON.stringify([webhook, ...channels])

      expect(json).toContain("[redacted]")
      expect(json).not.toContain("secret-webhook-token")
      expect(json).not.toContain("secret-header-token")
      expect(json).not.toContain("secret-pushover-token")
      expect(json).not.toContain("secret-pushover-user")
      expect(json).not.toContain("secret-smtp-password")
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

  it.effect("formats Apprise API deliveries", () => {
    const fetchSpy = stubSuccessfulFetch()

    return Effect.gen(function* () {
      const service = yield* NotificationService
      const channel = yield* service.createChannel({
        name: "Apprise",
        type: "apprise",
        enabled: true,
        events: ["server_down"],
        settings: { url: "https://apprise.example/notify/team-alerts" },
      })

      const delivery = yield* service.testChannel(channel.id, "server_down")
      const body = getFetchBody(fetchSpy)

      expect(delivery.status).toBe("sent")
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://apprise.example/notify/team-alerts",
        expect.objectContaining({ method: "POST" }),
      )
      expect(body).toMatchObject({
        title: "Test media server offline",
        body: "Example Server is not responding",
        type: "failure",
        format: "text",
      })
    }).pipe(Effect.provide(TestLayer))
  })

  it.effect("formats Notifiarr passthrough deliveries", () => {
    const fetchSpy = stubSuccessfulFetch()

    return Effect.gen(function* () {
      const service = yield* NotificationService
      const channel = yield* service.createChannel({
        name: "Notifiarr",
        type: "notifiarr",
        enabled: true,
        events: ["server_down"],
        settings: { token: "notifiarr-key", channelId: "735481457153277994" },
      })

      const delivery = yield* service.testChannel(channel.id, "server_down")
      const init = getFetchInit(fetchSpy)
      const rawBody = String(init.body)
      const body = JSON.parse(rawBody) as {
        notification: { name: string; event: string; update: boolean }
        discord: {
          color: string
          text: { title: string; description: string; footer: string }
        }
      }

      expect(delivery.status).toBe("sent")
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://notifiarr.com/api/v1/notification/passthrough/notifiarr-key",
        expect.objectContaining({ method: "POST" }),
      )
      expect(init.headers).toMatchObject({
        accept: "text/plain",
        "content-type": "application/json",
      })
      expect(rawBody).toContain('"channel":735481457153277994')
      expect(body.notification).toMatchObject({
        update: false,
        name: "ARR Hub",
        event: "server_down",
      })
      expect(body.discord).toMatchObject({
        color: "CF222E",
        text: {
          title: "Test media server offline",
          description: "Example Server is not responding",
          footer: "ARR Hub",
        },
      })
    }).pipe(Effect.provide(TestLayer))
  })

  it.effect("executes custom script deliveries with notification environment", () => {
    let tempDir: string | undefined

    return Effect.gen(function* () {
      tempDir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "arr-hub-notify-")))
      const scriptPath = join(tempDir, "notify.sh")
      const envPath = join(tempDir, "env.txt")
      const notificationPath = join(tempDir, "notification.json")

      yield* Effect.promise(async () => {
        await writeFile(
          scriptPath,
          [
            "#!/bin/sh",
            "{",
            "  printf '%s\\n' \"$ARR_HUB_EVENT\"",
            "  printf '%s\\n' \"$ARR_HUB_TITLE\"",
            "  printf '%s\\n' \"$ARR_HUB_MESSAGE\"",
            "  printf '%s\\n' \"$ARR_HUB_CHANNEL_NAME\"",
            '} > "$1"',
            'printf \'%s\' "$ARR_HUB_NOTIFICATION" > "$2"',
            "",
          ].join("\n"),
        )
        await chmod(scriptPath, 0o700)
      })

      const service = yield* NotificationService
      const channel = yield* service.createChannel({
        name: "Script",
        type: "custom_script",
        enabled: true,
        events: ["server_down"],
        settings: { scriptPath, scriptArgs: [envPath, notificationPath] },
      })

      const delivery = yield* service.testChannel(channel.id, "server_down")
      const envOutput = yield* Effect.promise(() => readFile(envPath, "utf8"))
      const notification = yield* Effect.promise(() => readFile(notificationPath, "utf8"))
      const parsed = JSON.parse(notification) as {
        event: string
        title: string
        message: string
        payload: { test: boolean; serverName: string }
      }

      expect(delivery.status).toBe("sent")
      expect(envOutput.split("\n").slice(0, 4)).toEqual([
        "server_down",
        "Test media server offline",
        "Example Server is not responding",
        "Script",
      ])
      expect(parsed).toMatchObject({
        event: "server_down",
        title: "Test media server offline",
        message: "Example Server is not responding",
        payload: { test: true, serverName: "Example Server" },
      })
    }).pipe(
      Effect.ensuring(
        Effect.promise(async () => {
          if (tempDir) await rm(tempDir, { recursive: true, force: true })
        }),
      ),
      Effect.provide(TestLayer),
    )
  })

  it.effect("sends SMTP email deliveries", () => {
    let smtpServer: Awaited<ReturnType<typeof startFakeSmtpServer>> | undefined

    return Effect.gen(function* () {
      smtpServer = yield* Effect.promise(() => startFakeSmtpServer())
      const service = yield* NotificationService
      const channel = yield* service.createChannel({
        name: "Email",
        type: "email",
        enabled: true,
        events: ["server_down"],
        settings: {
          smtpHost: "127.0.0.1",
          smtpPort: smtpServer.port,
          smtpSecurity: "none",
          fromEmail: "alerts@example.com",
          toEmails: ["ops@example.com"],
        },
      })

      const delivery = yield* service.testChannel(channel.id, "server_down")

      expect(delivery.status).toBe("sent")
      expect(smtpServer.commands).toContain("MAIL FROM:<alerts@example.com>")
      expect(smtpServer.commands).toContain("RCPT TO:<ops@example.com>")
      expect(smtpServer.commands).toContain("DATA")
      expect(smtpServer.messages[0]).toContain("Subject: Test media server offline")
      expect(smtpServer.messages[0]).toContain("Example Server is not responding")
      expect(smtpServer.messages[0]).toContain("Event: server_down")
    }).pipe(
      Effect.ensuring(
        Effect.promise(async () => {
          await smtpServer?.close()
        }),
      ),
      Effect.provide(TestLayer),
    )
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

  it.effect("requires Notifiarr credentials and a numeric Discord channel ID", () =>
    Effect.gen(function* () {
      const service = yield* NotificationService
      const missing = yield* Effect.either(
        service.createChannel({
          name: "Notifiarr",
          type: "notifiarr",
          enabled: true,
          events: ["server_down"],
          settings: { token: "api-key" },
        }),
      )
      const invalid = yield* Effect.either(
        service.createChannel({
          name: "Notifiarr",
          type: "notifiarr",
          enabled: true,
          events: ["server_down"],
          settings: { token: "api-key", channelId: "not-a-channel" },
        }),
      )

      expect(missing._tag).toBe("Left")
      if (missing._tag === "Left") {
        expect(missing.left.message).toBe("Notifiarr API key and Discord channel ID are required")
      }
      expect(invalid._tag).toBe("Left")
      if (invalid._tag === "Left") {
        expect(invalid.left.message).toBe("Notifiarr Discord channel ID must be numeric")
      }
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("requires a valid custom script path", () =>
    Effect.gen(function* () {
      const service = yield* NotificationService
      const missing = yield* Effect.either(
        service.createChannel({
          name: "Script",
          type: "custom_script",
          enabled: true,
          events: ["server_down"],
          settings: {},
        }),
      )
      const relative = yield* Effect.either(
        service.createChannel({
          name: "Script",
          type: "custom_script",
          enabled: true,
          events: ["server_down"],
          settings: { scriptPath: "notify.sh" },
        }),
      )
      const absent = yield* Effect.either(
        service.createChannel({
          name: "Script",
          type: "custom_script",
          enabled: true,
          events: ["server_down"],
          settings: { scriptPath: "/definitely/not/here/notify.sh" },
        }),
      )

      expect(missing._tag).toBe("Left")
      if (missing._tag === "Left") {
        expect(missing.left.message).toBe("custom script path is required")
      }
      expect(relative._tag).toBe("Left")
      if (relative._tag === "Left") {
        expect(relative.left.message).toBe("custom script path must be absolute")
      }
      expect(absent._tag).toBe("Left")
      if (absent._tag === "Left") {
        expect(absent.left.message).toBe("custom script path must point to a file")
      }
    }).pipe(Effect.provide(TestLayer)),
  )

  it.effect("requires valid SMTP email settings", () =>
    Effect.gen(function* () {
      const service = yield* NotificationService
      const missingHost = yield* Effect.either(
        service.createChannel({
          name: "Email",
          type: "email",
          enabled: true,
          events: ["server_down"],
          settings: {
            fromEmail: "alerts@example.com",
            toEmails: ["ops@example.com"],
          },
        }),
      )
      const invalidRecipient = yield* Effect.either(
        service.createChannel({
          name: "Email",
          type: "email",
          enabled: true,
          events: ["server_down"],
          settings: {
            smtpHost: "smtp.example.com",
            smtpPort: 25,
            smtpSecurity: "none",
            fromEmail: "alerts@example.com",
            toEmails: ["not-an-email"],
          },
        }),
      )
      const missingPassword = yield* Effect.either(
        service.createChannel({
          name: "Email",
          type: "email",
          enabled: true,
          events: ["server_down"],
          settings: {
            smtpHost: "smtp.example.com",
            smtpPort: 25,
            smtpSecurity: "none",
            smtpUsername: "alerts",
            fromEmail: "alerts@example.com",
            toEmails: ["ops@example.com"],
          },
        }),
      )

      expect(missingHost._tag).toBe("Left")
      if (missingHost._tag === "Left") {
        expect(missingHost.left.message).toBe("SMTP host is required")
      }
      expect(invalidRecipient._tag).toBe("Left")
      if (invalidRecipient._tag === "Left") {
        expect(invalidRecipient.left.message).toBe("email recipients are invalid")
      }
      expect(missingPassword._tag).toBe("Left")
      if (missingPassword._tag === "Left") {
        expect(missingPassword.left.message).toBe("SMTP password is required when username is set")
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

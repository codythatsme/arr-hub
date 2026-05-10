import { execFile } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { isAbsolute } from "node:path"

import { SqlError } from "@effect/sql/SqlError"
import { desc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import {
  notificationChannels,
  notificationChannelTypes,
  notificationDeliveries,
  notificationEvents,
  type NotificationChannelSettings,
  type NotificationChannelType,
  type NotificationEvent,
} from "#/db/schema"

import { ValidationError } from "../errors"
import { Db } from "./Db"
import type { MonitoringTrigger } from "./MonitoringTriggerBus"
import { MonitoringTriggerBus } from "./MonitoringTriggerBus"
import { recordDomainHistory } from "./OperationalHistoryService"

const ALL_EVENTS: ReadonlyArray<NotificationEvent> = notificationEvents
const ALL_CHANNEL_TYPES: ReadonlyArray<NotificationChannelType> = notificationChannelTypes
const NOTIFIARR_CHANNEL_ID_PLACEHOLDER = "__ARR_HUB_NOTIFIARR_CHANNEL_ID__"
const URL_CHANNEL_TYPES = new Set<NotificationChannelType>([
  "webhook",
  "discord",
  "slack",
  "ntfy",
  "gotify",
  "telegram",
  "apprise",
])
const OUTBOUND_CHANNEL_TYPES = new Set<NotificationChannelType>([
  ...URL_CHANNEL_TYPES,
  "pushover",
  "notifiarr",
  "custom_script",
])

interface FormattedNotification {
  readonly event: NotificationEvent
  readonly title: string
  readonly message: string
  readonly payload: Record<string, unknown>
}

function isUrlChannelType(type: NotificationChannelType): boolean {
  return URL_CHANNEL_TYPES.has(type)
}

function isOutboundChannelType(type: NotificationChannelType): boolean {
  return OUTBOUND_CHANNEL_TYPES.has(type)
}

function channelTypeLabel(type: NotificationChannelType): string {
  switch (type) {
    case "in_app":
      return "in-app"
    case "webhook":
      return "webhook"
    case "discord":
      return "Discord webhook"
    case "slack":
      return "Slack webhook"
    case "ntfy":
      return "Ntfy topic"
    case "gotify":
      return "Gotify message endpoint"
    case "telegram":
      return "Telegram sendMessage endpoint"
    case "pushover":
      return "Pushover"
    case "apprise":
      return "Apprise API endpoint"
    case "notifiarr":
      return "Notifiarr"
    case "custom_script":
      return "custom script"
  }
}

function escapeSlackText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function escapeTelegramHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function isFailureEvent(event: NotificationEvent): boolean {
  return event.includes("failed") || event.includes("down")
}

function formatOutboundPayload(
  channel: NotificationChannel,
  event: NotificationEvent,
  title: string,
  message: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  switch (channel.type) {
    case "discord":
      return {
        username: "ARR Hub",
        embeds: [
          {
            title,
            description: message,
            color: isFailureEvent(event) ? 13_626_624 : 3_443_003,
            fields: [{ name: "Event", value: event.replaceAll("_", " "), inline: true }],
          },
        ],
      }
    case "slack":
      return {
        text: `${title}\n${message}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${escapeSlackText(title)}*\n${escapeSlackText(message)}`,
            },
          },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: `Event: \`${event}\`` }],
          },
        ],
      }
    case "gotify":
      return {
        title,
        message,
        priority: isFailureEvent(event) ? 8 : 4,
      }
    case "telegram":
      return {
        text: `<b>${escapeTelegramHtml(title)}</b>\n${escapeTelegramHtml(message)}`,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }
    case "apprise":
      return {
        title,
        body: message,
        type: isFailureEvent(event) ? "failure" : "info",
        format: "text",
      }
    case "notifiarr":
      return {
        notification: {
          update: false,
          name: "ARR Hub",
          event,
        },
        discord: {
          color: isFailureEvent(event) ? "CF222E" : "348FEB",
          ping: {
            pingUser: 0,
            pingRole: 0,
          },
          images: {
            thumbnail: "",
            image: "",
          },
          text: {
            title,
            icon: "",
            content: title,
            description: message,
            fields: [{ title: "Event", text: event.replaceAll("_", " "), inline: true }],
            footer: "ARR Hub",
          },
          ids: {
            channel: NOTIFIARR_CHANNEL_ID_PLACEHOLDER,
          },
        },
      }
    case "webhook":
    case "ntfy":
    case "pushover":
    case "custom_script":
    case "in_app":
      return { event, title, message, payload }
  }
}

function stringifyNotifiarrPayload(payload: Record<string, unknown>, channelId: string): string {
  return JSON.stringify(payload).replace(`"${NOTIFIARR_CHANNEL_ID_PLACEHOLDER}"`, channelId)
}

function runCustomScript(
  channel: NotificationChannel,
  event: NotificationEvent,
  title: string,
  message: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const scriptPath = channel.settings.scriptPath ?? ""
  const args = channel.settings.scriptArgs ?? []

  return new Promise((resolve, reject) => {
    execFile(
      scriptPath,
      [...args],
      {
        env: {
          ...process.env,
          ARR_HUB_CHANNEL_ID: String(channel.id),
          ARR_HUB_CHANNEL_NAME: channel.name,
          ARR_HUB_EVENT: event,
          ARR_HUB_TITLE: title,
          ARR_HUB_MESSAGE: message,
          ARR_HUB_PAYLOAD: JSON.stringify(payload),
          ARR_HUB_NOTIFICATION: JSON.stringify({ event, title, message, payload }),
        },
        timeout: 30_000,
        windowsHide: true,
      },
      (error) => {
        if (!error) {
          resolve()
          return
        }

        const failed = error as NodeJS.ErrnoException & { signal?: NodeJS.Signals | null }
        if (failed.signal) {
          reject(new Error(`custom script terminated by ${failed.signal}`))
          return
        }

        reject(new Error(`custom script exited with code ${String(failed.code ?? "unknown")}`))
      },
    )
  })
}

function formatTrigger(trigger: MonitoringTrigger): FormattedNotification {
  switch (trigger.kind) {
    case "session_start":
      return {
        event: trigger.kind,
        title: "Stream started",
        message: `${trigger.session.username} started ${trigger.session.title}`,
        payload: { session: trigger.session },
      }
    case "session_stop":
      return {
        event: trigger.kind,
        title: "Stream stopped",
        message: `${trigger.session.username} stopped ${trigger.session.title} at ${Math.round(trigger.watchedPercent)}%`,
        payload: { session: trigger.session, watchedPercent: trigger.watchedPercent },
      }
    case "media_watched":
      return {
        event: trigger.kind,
        title: "Media watched",
        message: `${trigger.session.username} watched ${trigger.session.title}`,
        payload: { session: trigger.session },
      }
    case "server_down":
      return {
        event: trigger.kind,
        title: "Media server offline",
        message: `${trigger.serverName} is not responding`,
        payload: { serverId: trigger.serverId, serverName: trigger.serverName },
      }
    case "server_up":
      return {
        event: trigger.kind,
        title: "Media server online",
        message: `${trigger.serverName} is reachable again`,
        payload: { serverId: trigger.serverId, serverName: trigger.serverName },
      }
    case "new_content":
      return {
        event: trigger.kind,
        title: "New content added",
        message: `${trigger.title} was added to ${trigger.libraryName}`,
        payload: {
          mediaType: trigger.mediaType,
          title: trigger.title,
          libraryName: trigger.libraryName,
        },
      }
    case "operational":
      return {
        event: trigger.event,
        title: trigger.title,
        message: trigger.message,
        payload: trigger.payload,
      }
  }
}

function formatTestNotification(event: NotificationEvent): FormattedNotification {
  switch (event) {
    case "session_start":
      return {
        event,
        title: "Test stream started",
        message: "ARR Hub test user started Example Movie",
        payload: { test: true, mediaType: "movie", title: "Example Movie" },
      }
    case "session_stop":
      return {
        event,
        title: "Test stream stopped",
        message: "ARR Hub test user stopped Example Movie at 92%",
        payload: { test: true, mediaType: "movie", title: "Example Movie", watchedPercent: 92 },
      }
    case "media_watched":
      return {
        event,
        title: "Test media watched",
        message: "ARR Hub test user watched Example Movie",
        payload: { test: true, mediaType: "movie", title: "Example Movie" },
      }
    case "server_down":
      return {
        event,
        title: "Test media server offline",
        message: "Example Server is not responding",
        payload: { test: true, serverId: 1, serverName: "Example Server" },
      }
    case "server_up":
      return {
        event,
        title: "Test media server online",
        message: "Example Server is reachable again",
        payload: { test: true, serverId: 1, serverName: "Example Server" },
      }
    case "new_content":
      return {
        event,
        title: "Test new content added",
        message: "Example Movie was added to Movies",
        payload: { test: true, mediaType: "movie", title: "Example Movie", libraryName: "Movies" },
      }
    default:
      return {
        event,
        title: `Test ${event.replaceAll("_", " ")}`,
        message: `ARR Hub test notification for ${event.replaceAll("_", " ")}`,
        payload: { test: true, event },
      }
  }
}

export interface NotificationChannelInput {
  readonly name: string
  readonly type: NotificationChannelType
  readonly enabled: boolean
  readonly events: ReadonlyArray<NotificationEvent>
  readonly settings: NotificationChannelSettings
}

export type NotificationChannel = typeof notificationChannels.$inferSelect
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect

export class NotificationService extends Context.Tag("@arr-hub/NotificationService")<
  NotificationService,
  {
    readonly listChannels: () => Effect.Effect<ReadonlyArray<NotificationChannel>, SqlError>
    readonly createChannel: (
      input: NotificationChannelInput,
    ) => Effect.Effect<NotificationChannel, ValidationError | SqlError>
    readonly updateChannel: (
      id: number,
      input: Partial<NotificationChannelInput>,
    ) => Effect.Effect<NotificationChannel, ValidationError | SqlError>
    readonly deleteChannel: (id: number) => Effect.Effect<void, SqlError>
    readonly listDeliveries: (
      limit?: number,
    ) => Effect.Effect<ReadonlyArray<NotificationDelivery>, SqlError>
    readonly testChannel: (
      id: number,
      event?: NotificationEvent,
    ) => Effect.Effect<NotificationDelivery, ValidationError | SqlError>
    readonly deliverTrigger: (trigger: MonitoringTrigger) => Effect.Effect<void, SqlError>
    readonly runWorker: () => Effect.Effect<never, SqlError>
  }
>() {}

export const NotificationServiceLive = Layer.effect(
  NotificationService,
  Effect.gen(function* () {
    const db = yield* Db
    const bus = yield* MonitoringTriggerBus

    const normalizeInput = (
      input: Partial<NotificationChannelInput> & Pick<NotificationChannelInput, "name" | "type">,
    ): Effect.Effect<NotificationChannelInput, ValidationError> =>
      Effect.gen(function* () {
        const name = input.name.trim()
        if (name.length === 0) {
          return yield* Effect.fail(new ValidationError({ message: "channel name is required" }))
        }

        if (!ALL_CHANNEL_TYPES.includes(input.type)) {
          return yield* Effect.fail(new ValidationError({ message: "unsupported channel type" }))
        }

        const events = input.events?.length ? [...new Set(input.events)] : ALL_EVENTS
        const invalidEvent = events.find((event) => !ALL_EVENTS.includes(event))
        if (invalidEvent) {
          return yield* Effect.fail(
            new ValidationError({ message: `unsupported notification event: ${invalidEvent}` }),
          )
        }

        const settings = input.settings ?? {}
        if (isUrlChannelType(input.type) && !settings.url?.trim()) {
          return yield* Effect.fail(
            new ValidationError({ message: `${channelTypeLabel(input.type)} url is required` }),
          )
        }
        if (input.type === "pushover" && (!settings.token?.trim() || !settings.user?.trim())) {
          return yield* Effect.fail(
            new ValidationError({ message: "Pushover token and user key are required" }),
          )
        }
        if (
          input.type === "notifiarr" &&
          (!settings.token?.trim() || !settings.channelId?.trim())
        ) {
          return yield* Effect.fail(
            new ValidationError({
              message: "Notifiarr API key and Discord channel ID are required",
            }),
          )
        }
        if (input.type === "notifiarr" && !/^\d+$/.test(settings.channelId?.trim() ?? "")) {
          return yield* Effect.fail(
            new ValidationError({ message: "Notifiarr Discord channel ID must be numeric" }),
          )
        }
        if (input.type === "custom_script") {
          const scriptPath = settings.scriptPath?.trim()
          if (!scriptPath) {
            return yield* Effect.fail(
              new ValidationError({ message: "custom script path is required" }),
            )
          }
          if (!isAbsolute(scriptPath)) {
            return yield* Effect.fail(
              new ValidationError({ message: "custom script path must be absolute" }),
            )
          }
          const scriptFileExists = (() => {
            try {
              return existsSync(scriptPath) && statSync(scriptPath).isFile()
            } catch {
              return false
            }
          })()
          if (!scriptFileExists) {
            return yield* Effect.fail(
              new ValidationError({ message: "custom script path must point to a file" }),
            )
          }
        }

        const normalizedSettings =
          input.type === "pushover"
            ? { ...settings, token: settings.token?.trim(), user: settings.user?.trim() }
            : input.type === "notifiarr"
              ? {
                  ...settings,
                  token: settings.token?.trim(),
                  channelId: settings.channelId?.trim(),
                }
              : input.type === "custom_script"
                ? {
                    ...settings,
                    scriptPath: settings.scriptPath?.trim(),
                    scriptArgs:
                      settings.scriptArgs
                        ?.map((argument) => argument.trim())
                        .filter((argument) => argument.length > 0) ?? [],
                  }
                : isUrlChannelType(input.type)
                  ? { ...settings, url: settings.url?.trim() }
                  : settings

        return {
          name,
          type: input.type,
          enabled: input.enabled ?? true,
          events,
          settings: normalizedSettings,
        }
      })

    const sendOutbound = (
      channel: NotificationChannel,
      event: NotificationEvent,
      title: string,
      message: string,
      payload: Record<string, unknown>,
    ) =>
      Effect.tryPromise({
        try: async () => {
          if (channel.type === "custom_script") {
            await runCustomScript(channel, event, title, message, payload)
            return
          }

          const response =
            channel.type === "pushover"
              ? await fetch("https://api.pushover.net/1/messages.json", {
                  method: "POST",
                  headers: {
                    "content-type": "application/x-www-form-urlencoded",
                    ...channel.settings.headers,
                  },
                  body: new URLSearchParams({
                    token: channel.settings.token ?? "",
                    user: channel.settings.user ?? "",
                    title,
                    message,
                    priority: isFailureEvent(event) ? "1" : "0",
                  }).toString(),
                })
              : channel.type === "notifiarr"
                ? await fetch(
                    `https://notifiarr.com/api/v1/notification/passthrough/${encodeURIComponent(
                      channel.settings.token ?? "",
                    )}`,
                    {
                      method: "POST",
                      headers: {
                        accept: "text/plain",
                        "content-type": "application/json",
                        ...channel.settings.headers,
                      },
                      body: stringifyNotifiarrPayload(
                        formatOutboundPayload(channel, event, title, message, payload),
                        channel.settings.channelId ?? "",
                      ),
                    },
                  )
                : await fetch(channel.settings.url ?? "", {
                    method: "POST",
                    headers:
                      channel.type === "ntfy"
                        ? {
                            "content-type": "text/plain; charset=utf-8",
                            title,
                            tags: isFailureEvent(event) ? "warning" : "bell",
                            priority: isFailureEvent(event) ? "4" : "3",
                            ...channel.settings.headers,
                          }
                        : {
                            "content-type": "application/json",
                            ...channel.settings.headers,
                          },
                    body:
                      channel.type === "ntfy"
                        ? message
                        : JSON.stringify(
                            formatOutboundPayload(channel, event, title, message, payload),
                          ),
                  })
          if (!response.ok) {
            throw new Error(`${channelTypeLabel(channel.type)} returned ${response.status}`)
          }
        },
        catch: (error) => error,
      })

    const recordDelivery = (
      channelId: number | null,
      event: NotificationEvent,
      title: string,
      message: string,
      payload: Record<string, unknown>,
      status: "sent" | "failed" | "skipped",
      errorMessage?: string,
    ) =>
      Effect.gen(function* () {
        const rows = yield* db
          .insert(notificationDeliveries)
          .values({
            channelId,
            event,
            title,
            message,
            payload,
            status,
            errorMessage,
          })
          .returning()
        const delivery = rows[0]
        yield* recordDomainHistory(db, {
          eventType: "notification_delivery",
          notificationDeliveryId: delivery.id,
          title: `Notification ${status}: ${title}`,
          message,
          metadata: {
            channelId,
            event,
            status,
            errorMessage: errorMessage ?? null,
            payload,
          },
        })
        return delivery
      })

    const deliverFormattedToChannel = (
      channel: NotificationChannel,
      formatted: FormattedNotification,
    ) =>
      Effect.gen(function* () {
        if (isOutboundChannelType(channel.type)) {
          const result = yield* Effect.either(
            sendOutbound(
              channel,
              formatted.event,
              formatted.title,
              formatted.message,
              formatted.payload,
            ),
          )
          if (result._tag === "Left") {
            return yield* recordDelivery(
              channel.id,
              formatted.event,
              formatted.title,
              formatted.message,
              formatted.payload,
              "failed",
              String(result.left),
            )
          }
        }

        return yield* recordDelivery(
          channel.id,
          formatted.event,
          formatted.title,
          formatted.message,
          formatted.payload,
          "sent",
        )
      })

    const deliverTrigger = (trigger: MonitoringTrigger) =>
      Effect.gen(function* () {
        const formatted = formatTrigger(trigger)
        const channels = yield* db
          .select()
          .from(notificationChannels)
          .where(eq(notificationChannels.enabled, true))
        const subscribed = channels.filter((channel) => channel.events.includes(formatted.event))

        if (subscribed.length === 0) {
          yield* recordDelivery(
            null,
            formatted.event,
            formatted.title,
            formatted.message,
            formatted.payload,
            "skipped",
            "no enabled channel subscribed",
          )
          return
        }

        for (const channel of subscribed) {
          yield* deliverFormattedToChannel(channel, formatted)
        }
      })

    return {
      listChannels: () =>
        db.select().from(notificationChannels).orderBy(desc(notificationChannels.updatedAt)),

      createChannel: (input) =>
        Effect.gen(function* () {
          const normalized = yield* normalizeInput(input)
          const inserted = yield* db.insert(notificationChannels).values(normalized).returning()
          return inserted[0]
        }),

      updateChannel: (id, input) =>
        Effect.gen(function* () {
          const existingRows = yield* db
            .select()
            .from(notificationChannels)
            .where(eq(notificationChannels.id, id))
          const existing = existingRows[0]
          if (!existing) {
            return yield* Effect.fail(new ValidationError({ message: "channel not found" }))
          }
          const normalized = yield* normalizeInput({
            name: input.name ?? existing.name,
            type: input.type ?? existing.type,
            enabled: input.enabled ?? existing.enabled,
            events: input.events ?? existing.events,
            settings: input.settings ?? existing.settings,
          })
          const updated = yield* db
            .update(notificationChannels)
            .set({ ...normalized, updatedAt: new Date() })
            .where(eq(notificationChannels.id, id))
            .returning()
          return updated[0]
        }),

      deleteChannel: (id) =>
        db.delete(notificationChannels).where(eq(notificationChannels.id, id)).pipe(Effect.asVoid),

      listDeliveries: (limit = 50) =>
        db
          .select()
          .from(notificationDeliveries)
          .orderBy(desc(notificationDeliveries.deliveredAt))
          .limit(limit),

      testChannel: (id, event = "server_up") =>
        Effect.gen(function* () {
          if (!ALL_EVENTS.includes(event)) {
            return yield* Effect.fail(
              new ValidationError({ message: `unsupported notification event: ${event}` }),
            )
          }

          const rows = yield* db
            .select()
            .from(notificationChannels)
            .where(eq(notificationChannels.id, id))
          const channel = rows[0]
          if (!channel) {
            return yield* Effect.fail(new ValidationError({ message: "channel not found" }))
          }

          return yield* deliverFormattedToChannel(channel, formatTestNotification(event))
        }),

      deliverTrigger,

      runWorker: () =>
        Effect.scoped(
          Effect.gen(function* () {
            const subscription = yield* bus.subscribe()
            return yield* Effect.forever(
              Effect.gen(function* () {
                const trigger = yield* subscription.take
                yield* deliverTrigger(trigger)
              }),
            )
          }),
        ),
    }
  }),
)

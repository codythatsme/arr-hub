import { SqlError } from "@effect/sql/SqlError"
import { desc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import {
  notificationChannels,
  notificationDeliveries,
  type NotificationChannelSettings,
  type NotificationChannelType,
  type NotificationEvent,
} from "#/db/schema"

import { ValidationError } from "../errors"
import { Db } from "./Db"
import type { MonitoringTrigger } from "./MonitoringTriggerBus"
import { MonitoringTriggerBus } from "./MonitoringTriggerBus"
import { recordDomainHistory } from "./OperationalHistoryService"

const ALL_EVENTS: ReadonlyArray<NotificationEvent> = [
  "session_start",
  "session_stop",
  "media_watched",
  "server_down",
  "server_up",
  "new_content",
]

function formatTrigger(trigger: MonitoringTrigger) {
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

        if (!["in_app", "webhook"].includes(input.type)) {
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
        if (input.type === "webhook" && !settings.url?.trim()) {
          return yield* Effect.fail(new ValidationError({ message: "webhook url is required" }))
        }

        return {
          name,
          type: input.type,
          enabled: input.enabled ?? true,
          events,
          settings:
            input.type === "webhook" ? { ...settings, url: settings.url?.trim() } : settings,
        }
      })

    const sendWebhook = (
      channel: NotificationChannel,
      event: NotificationEvent,
      title: string,
      message: string,
      payload: Record<string, unknown>,
    ) =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(channel.settings.url ?? "", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...channel.settings.headers,
            },
            body: JSON.stringify({ event, title, message, payload }),
          })
          if (!response.ok) {
            throw new Error(`webhook returned ${response.status}`)
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
          if (channel.type === "webhook") {
            const result = yield* Effect.either(
              sendWebhook(
                channel,
                formatted.event,
                formatted.title,
                formatted.message,
                formatted.payload,
              ),
            )
            if (result._tag === "Left") {
              yield* recordDelivery(
                channel.id,
                formatted.event,
                formatted.title,
                formatted.message,
                formatted.payload,
                "failed",
                String(result.left),
              )
              continue
            }
          }

          yield* recordDelivery(
            channel.id,
            formatted.event,
            formatted.title,
            formatted.message,
            formatted.payload,
            "sent",
          )
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

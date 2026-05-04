import type { Queue, Scope } from "effect"
import { Context, Effect, Layer, PubSub } from "effect"

import type { MediaServerSession, SessionMediaType } from "../domain/mediaServer"

export type MonitoringTrigger =
  | { readonly kind: "session_start"; readonly session: MediaServerSession }
  | {
      readonly kind: "session_stop"
      readonly session: MediaServerSession
      readonly watchedPercent: number
    }
  | { readonly kind: "media_watched"; readonly session: MediaServerSession }
  | { readonly kind: "server_down"; readonly serverId: number; readonly serverName: string }
  | { readonly kind: "server_up"; readonly serverId: number; readonly serverName: string }
  | {
      readonly kind: "new_content"
      readonly mediaType: SessionMediaType
      readonly title: string
      readonly libraryName: string
    }

export class MonitoringTriggerBus extends Context.Tag("@arr-hub/MonitoringTriggerBus")<
  MonitoringTriggerBus,
  {
    readonly emit: (trigger: MonitoringTrigger) => Effect.Effect<void>
    readonly subscribe: () => Effect.Effect<Queue.Dequeue<MonitoringTrigger>, never, Scope.Scope>
  }
>() {}

export const MonitoringTriggerBusLive = Layer.effect(
  MonitoringTriggerBus,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.sliding<MonitoringTrigger>(256)

    return {
      emit: (trigger) => PubSub.publish(pubsub, trigger).pipe(Effect.asVoid),
      subscribe: () => PubSub.subscribe(pubsub),
    }
  }),
)

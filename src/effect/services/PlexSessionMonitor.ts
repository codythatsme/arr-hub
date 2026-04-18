import { SqlError } from "@effect/sql/SqlError"
import { eq } from "drizzle-orm"
import { Context, Effect, Fiber, Layer, Ref, Runtime, Schedule } from "effect"

import { mediaServers } from "#/db/schema"

import type { MediaServerConfig, MediaServerSession } from "../domain/mediaServer"
import {
  MediaServerError,
  NotFoundError,
  type EncryptionError,
  type ValidationError,
} from "../errors"
import { AdapterRegistry } from "./AdapterRegistry"
import { CryptoService } from "./CryptoService"
import { Db } from "./Db"
import type { MediaServerAdapter } from "./MediaServerAdapter"
import { SessionHistoryService } from "./SessionHistoryService"

// ── Notification payload (Plex `/:/websockets/notifications`) ──

interface PlaySessionStateNotification {
  readonly sessionKey: string
  readonly state?: string
}

interface NotificationContainer {
  readonly type?: string
  readonly PlaySessionStateNotification?: ReadonlyArray<PlaySessionStateNotification>
}

interface NotificationEnvelope {
  readonly NotificationContainer?: NotificationContainer
}

// ── Types ──

type ServerSessions = ReadonlyMap<string, MediaServerSession>
type SessionMap = ReadonlyMap<number, ServerSessions>
type FiberMap = Map<number, Fiber.RuntimeFiber<void, never>>

type StartError = NotFoundError | ValidationError | EncryptionError | MediaServerError | SqlError

// ── Service tag ──

export class PlexSessionMonitor extends Context.Tag("@arr-hub/PlexSessionMonitor")<
  PlexSessionMonitor,
  {
    readonly start: (serverId: number) => Effect.Effect<void, StartError>
    readonly stop: (serverId: number) => Effect.Effect<void>
    readonly startAllEnabled: () => Effect.Effect<void, SqlError>
    readonly stopAll: () => Effect.Effect<void>
    readonly getActive: () => Effect.Effect<ReadonlyArray<MediaServerSession>>
    readonly getActiveForServer: (
      serverId: number,
    ) => Effect.Effect<ReadonlyArray<MediaServerSession>>
  }
>() {}

// ── Pure helpers (exported for unit tests) ──

export function buildWsUrl(config: {
  readonly host: string
  readonly port: number
  readonly useSsl: boolean
  readonly token: string
}): string {
  const scheme = config.useSsl ? "wss" : "ws"
  return `${scheme}://${config.host}:${config.port}/:/websockets/notifications?X-Plex-Token=${encodeURIComponent(config.token)}`
}

/** Pure reconciliation: returns next map + sessions that disappeared (stopped). */
export function reconcileSessions(
  prev: SessionMap,
  serverId: number,
  next: ReadonlyArray<MediaServerSession>,
): { readonly map: SessionMap; readonly stopped: ReadonlyArray<MediaServerSession> } {
  const prevForServer = prev.get(serverId) ?? new Map<string, MediaServerSession>()
  const nextForServer = new Map<string, MediaServerSession>()
  for (const s of next) nextForServer.set(s.sessionKey, s)

  const stopped: Array<MediaServerSession> = []
  for (const [key, session] of prevForServer) {
    if (!nextForServer.has(key)) stopped.push(session)
  }

  const map = new Map(prev)
  map.set(serverId, nextForServer)
  return { map, stopped }
}

export function snapshotSessions(state: SessionMap): ReadonlyArray<MediaServerSession> {
  const out: Array<MediaServerSession> = []
  for (const serverMap of state.values()) {
    for (const s of serverMap.values()) out.push(s)
  }
  return out
}

/** Returns true when the WS payload represents a play-state notification (worth refreshing for). */
export function isPlayingNotification(raw: string): boolean {
  let envelope: NotificationEnvelope
  try {
    envelope = JSON.parse(raw) as NotificationEnvelope
  } catch {
    return false
  }
  const container = envelope.NotificationContainer
  return container?.type === "playing" && (container.PlaySessionStateNotification?.length ?? 0) > 0
}

// ── Live implementation ──

export const PlexSessionMonitorLive = Layer.scoped(
  PlexSessionMonitor,
  Effect.gen(function* () {
    const db = yield* Db
    const crypto = yield* CryptoService
    const registry = yield* AdapterRegistry
    const history = yield* SessionHistoryService

    const sessionsRef = yield* Ref.make<SessionMap>(new Map())
    const fibersRef = yield* Ref.make<FiberMap>(new Map())

    const refreshFromAdapter = (
      serverId: number,
      adapter: MediaServerAdapter,
    ): Effect.Effect<void, MediaServerError> =>
      Effect.gen(function* () {
        const sessions = yield* adapter.getActiveSessions()
        const stopped = yield* Ref.modify(sessionsRef, (prev) => {
          const result = reconcileSessions(prev, serverId, sessions)
          return [result.stopped, result.map]
        })
        if (stopped.length > 0) {
          yield* Effect.log(`[plex-monitor] server=${serverId} sessions ended: ${stopped.length}`)
          yield* history
            .writeHistory(stopped)
            .pipe(
              Effect.catchAll((e) =>
                Effect.logWarning(`[plex-monitor] history write failed: ${String(e)}`),
              ),
            )
        }
      })

    const handleMessage = (
      serverId: number,
      adapter: MediaServerAdapter,
      raw: string,
    ): Effect.Effect<void, never> =>
      Effect.gen(function* () {
        if (!isPlayingNotification(raw)) return
        yield* refreshFromAdapter(serverId, adapter).pipe(
          Effect.catchAll((e) =>
            Effect.logWarning(`[plex-monitor] server=${serverId} refresh failed: ${e.reason}`),
          ),
        )
      })

    const loadConfig = (
      serverId: number,
    ): Effect.Effect<MediaServerConfig, NotFoundError | EncryptionError | SqlError> =>
      Effect.gen(function* () {
        const rows = yield* db.select().from(mediaServers).where(eq(mediaServers.id, serverId))
        const row = rows[0]
        if (!row) return yield* new NotFoundError({ entity: "media_server", id: serverId })
        const token = yield* crypto.decrypt(row.tokenEncrypted)
        return {
          id: row.id,
          name: row.name,
          type: row.type,
          host: row.host,
          port: row.port,
          token,
          useSsl: row.useSsl,
          settings: row.settings,
        }
      })

    const connectWebSocket = (
      config: MediaServerConfig,
      adapter: MediaServerAdapter,
      runtime: Runtime.Runtime<never>,
    ): Effect.Effect<void, MediaServerError> =>
      Effect.async<void, MediaServerError>((resume) => {
        let ws: WebSocket
        try {
          ws = new WebSocket(buildWsUrl(config))
        } catch (e) {
          resume(
            Effect.fail(
              new MediaServerError({
                serverId: config.id,
                serverName: config.name,
                reason: "connection_refused",
                message: e instanceof Error ? e.message : "websocket construction failed",
                retryable: true,
              }),
            ),
          )
          return
        }

        let resolved = false
        const finish = (effect: Effect.Effect<void, MediaServerError>) => {
          if (resolved) return
          resolved = true
          resume(effect)
        }

        ws.addEventListener("open", () => {
          Runtime.runFork(runtime)(
            Effect.log(`[plex-monitor] WS open server=${config.id} (${config.name})`),
          )
          // Cold-start reconcile on connect.
          Runtime.runFork(runtime)(
            refreshFromAdapter(config.id, adapter).pipe(
              Effect.catchAll((e) =>
                Effect.logWarning(`[plex-monitor] cold-start failed: ${e.reason}`),
              ),
            ),
          )
        })

        ws.addEventListener("message", (ev) => {
          const data =
            typeof ev.data === "string"
              ? ev.data
              : ev.data instanceof ArrayBuffer
                ? new TextDecoder().decode(ev.data)
                : String(ev.data)
          Runtime.runFork(runtime)(handleMessage(config.id, adapter, data))
        })

        ws.addEventListener("error", () => {
          finish(
            Effect.fail(
              new MediaServerError({
                serverId: config.id,
                serverName: config.name,
                reason: "connection_refused",
                message: "websocket error",
                retryable: true,
              }),
            ),
          )
        })

        ws.addEventListener("close", () => {
          finish(
            Effect.fail(
              new MediaServerError({
                serverId: config.id,
                serverName: config.name,
                reason: "connection_refused",
                message: "websocket closed",
                retryable: true,
              }),
            ),
          )
        })

        return Effect.sync(() => {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close()
          }
        })
      })

    const monitorServer = (serverId: number): Effect.Effect<void, never> =>
      Effect.gen(function* () {
        const runtime = yield* Effect.runtime<never>()
        const reconnect = Schedule.exponential("1 seconds", 2).pipe(
          Schedule.either(Schedule.spaced("30 seconds")),
        )

        yield* Effect.gen(function* () {
          const config = yield* loadConfig(serverId)
          const factory = yield* registry.getMediaServerFactory(config.type)
          const adapter = factory(config)
          yield* connectWebSocket(config, adapter, runtime)
        }).pipe(
          Effect.catchAll((e) =>
            Effect.logWarning(`[plex-monitor] server=${serverId} error: ${String(e)}`),
          ),
          Effect.tap(() =>
            Ref.update(sessionsRef, (prev) => {
              const next = new Map(prev)
              next.delete(serverId)
              return next
            }),
          ),
          Effect.repeat(reconnect),
          Effect.asVoid,
          Effect.catchAllCause((c) =>
            Effect.logError(`[plex-monitor] server=${serverId} fatal: ${String(c)}`),
          ),
        )
      })

    const start: (serverId: number) => Effect.Effect<void, StartError> = (serverId) =>
      Effect.gen(function* () {
        const existing = (yield* Ref.get(fibersRef)).get(serverId)
        if (existing) return
        // Validate server + adapter exist before forking the fiber.
        const config = yield* loadConfig(serverId)
        yield* registry.getMediaServerFactory(config.type)
        const fiber = yield* Effect.forkDaemon(monitorServer(serverId))
        yield* Ref.update(fibersRef, (m) => {
          const next = new Map(m)
          next.set(serverId, fiber)
          return next
        })
      })

    const stop: (serverId: number) => Effect.Effect<void> = (serverId) =>
      Effect.gen(function* () {
        const fiber = (yield* Ref.get(fibersRef)).get(serverId)
        if (!fiber) return
        yield* Fiber.interrupt(fiber)
        yield* Ref.update(fibersRef, (m) => {
          const next = new Map(m)
          next.delete(serverId)
          return next
        })
        yield* Ref.update(sessionsRef, (prev) => {
          const next = new Map(prev)
          next.delete(serverId)
          return next
        })
      })

    const stopAll: () => Effect.Effect<void> = () =>
      Effect.gen(function* () {
        const fibers = yield* Ref.get(fibersRef)
        yield* Effect.forEach(fibers.values(), (f) => Fiber.interrupt(f), { discard: true })
        yield* Ref.set(fibersRef, new Map())
        yield* Ref.set(sessionsRef, new Map())
      })

    const startAllEnabled: () => Effect.Effect<void, SqlError> = () =>
      Effect.gen(function* () {
        const rows = yield* db.select().from(mediaServers).where(eq(mediaServers.enabled, true))
        for (const row of rows) {
          if (!row.settings.monitoringEnabled) continue
          yield* start(row.id).pipe(
            Effect.catchAll((e) =>
              Effect.logWarning(`[plex-monitor] start server=${row.id} failed: ${String(e)}`),
            ),
          )
        }
      })

    yield* Effect.addFinalizer(() => stopAll())

    return {
      start,
      stop,
      startAllEnabled,
      stopAll,
      getActive: () => Ref.get(sessionsRef).pipe(Effect.map(snapshotSessions)),
      getActiveForServer: (serverId) =>
        Ref.get(sessionsRef).pipe(Effect.map((m) => Array.from(m.get(serverId)?.values() ?? []))),
    }
  }),
)

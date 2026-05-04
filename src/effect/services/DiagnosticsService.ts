import { existsSync, statSync } from "node:fs"

import { SqlError } from "@effect/sql/SqlError"
import { count, eq } from "drizzle-orm"
import { Context, Effect, Layer, Ref } from "effect"

import {
  apiKeys,
  downloadClients,
  downloadQueue,
  indexers,
  mediaServers,
  movies,
  schedulerJobs,
  series,
  settings,
} from "#/db/schema"

import type { JobTypeSummary } from "../domain/scheduler"
import { DiagnosticsError } from "../errors"
import { Db } from "./Db"
import { DownloadClientService } from "./DownloadClientService"
import { IndexerService } from "./IndexerService"
import { MediaServerService } from "./MediaServerService"
import { SchedulerService } from "./SchedulerService"

const DB_PATH = process.env.DATABASE_PATH ?? "data/arr-hub.db"
const LOG_LIMIT = 500

export type LogLevel = "debug" | "info" | "warn" | "error"
export type HealthStatus = "healthy" | "degraded" | "unhealthy"

export interface SystemStatus {
  readonly version: string
  readonly uptimeSeconds: number
  readonly database: {
    readonly path: string
    readonly sizeBytes: number
    readonly tableCounts: {
      readonly movies: number
      readonly series: number
      readonly indexers: number
      readonly downloadClients: number
      readonly mediaServers: number
      readonly queueItems: number
      readonly settings: number
      readonly apiKeys: number
    }
  }
  readonly resources: {
    readonly rssBytes: number
    readonly heapUsedBytes: number
    readonly heapTotalBytes: number
    readonly externalBytes: number
    readonly userCpuMicros: number
    readonly systemCpuMicros: number
  }
}

export interface IntegrationHealthItem {
  readonly type: "indexer" | "download_client" | "media_server"
  readonly id: number
  readonly name: string
  readonly enabled: boolean
  readonly status: HealthStatus
  readonly lastCheck: Date | null
  readonly message: string | null
}

export interface AggregatedHealth {
  readonly status: HealthStatus
  readonly integrations: ReadonlyArray<IntegrationHealthItem>
  readonly failures: ReadonlyArray<{ readonly type: string; readonly message: string }>
}

export interface LogEntry {
  readonly id: number
  readonly timestamp: Date
  readonly level: LogLevel
  readonly message: string
  readonly context: Record<string, unknown> | null
}

export interface TaskSummary {
  readonly running: number
  readonly pending: number
  readonly failed: number
  readonly dead: number
  readonly byType: ReadonlyArray<JobTypeSummary>
}

export class DiagnosticsService extends Context.Tag("@arr-hub/DiagnosticsService")<
  DiagnosticsService,
  {
    readonly status: () => Effect.Effect<SystemStatus, SqlError>
    readonly health: () => Effect.Effect<AggregatedHealth, SqlError>
    readonly logs: (filters?: {
      readonly level?: LogLevel
      readonly count?: number
    }) => Effect.Effect<ReadonlyArray<LogEntry>, DiagnosticsError>
    readonly log: (
      level: LogLevel,
      message: string,
      context?: Record<string, unknown>,
    ) => Effect.Effect<void>
    readonly tasks: () => Effect.Effect<TaskSummary, SqlError>
  }
>() {}

function dbSizeBytes(): number {
  return existsSync(DB_PATH) ? statSync(DB_PATH).size : 0
}

function normalizeHealth(status: string | null | undefined, enabled: boolean): HealthStatus {
  if (!enabled) return "degraded"
  if (status === "healthy") return "healthy"
  if (status === "unhealthy") return "unhealthy"
  return "degraded"
}

function worstStatus(
  items: ReadonlyArray<IntegrationHealthItem>,
  failures: ReadonlyArray<unknown>,
) {
  if (items.some((item) => item.status === "unhealthy")) return "unhealthy" as const
  if (failures.length > 0 || items.some((item) => item.status === "degraded")) {
    return "degraded" as const
  }
  return "healthy" as const
}

export const DiagnosticsServiceLive = Layer.effect(
  DiagnosticsService,
  Effect.gen(function* () {
    const db = yield* Db
    const indexerService = yield* IndexerService
    const downloadClientService = yield* DownloadClientService
    const mediaServerService = yield* MediaServerService
    const schedulerService = yield* SchedulerService
    const logsRef = yield* Ref.make<ReadonlyArray<LogEntry>>([])
    const nextLogIdRef = yield* Ref.make(1)

    const tableCount = <T>(table: T) =>
      db
        .select({ value: count() })
        // @ts-expect-error drizzle table type is preserved at call sites; generic helper keeps repetition low.
        .from(table)
        .pipe(Effect.map((rows) => rows[0]?.value ?? 0))

    return {
      status: () =>
        Effect.gen(function* () {
          const [
            movieCount,
            seriesCount,
            indexerCount,
            clientCount,
            serverCount,
            queueCount,
            settingCount,
            keyCount,
          ] = yield* Effect.all([
            tableCount(movies),
            tableCount(series),
            tableCount(indexers),
            tableCount(downloadClients),
            tableCount(mediaServers),
            tableCount(downloadQueue),
            tableCount(settings),
            tableCount(apiKeys),
          ])
          const memory = process.memoryUsage()
          const cpu = process.cpuUsage()

          return {
            version: process.env.npm_package_version ?? "0.0.0-dev",
            uptimeSeconds: Math.floor(process.uptime()),
            database: {
              path: DB_PATH,
              sizeBytes: dbSizeBytes(),
              tableCounts: {
                movies: movieCount,
                series: seriesCount,
                indexers: indexerCount,
                downloadClients: clientCount,
                mediaServers: serverCount,
                queueItems: queueCount,
                settings: settingCount,
                apiKeys: keyCount,
              },
            },
            resources: {
              rssBytes: memory.rss,
              heapUsedBytes: memory.heapUsed,
              heapTotalBytes: memory.heapTotal,
              externalBytes: memory.external,
              userCpuMicros: cpu.user,
              systemCpuMicros: cpu.system,
            },
          }
        }),

      health: () =>
        Effect.gen(function* () {
          const [indexerResult, clientResult, serverResult] = yield* Effect.all([
            Effect.either(indexerService.list()),
            Effect.either(downloadClientService.list()),
            Effect.either(mediaServerService.list()),
          ])

          const failures: Array<{ type: string; message: string }> = []
          const integrations: Array<IntegrationHealthItem> = []

          if (indexerResult._tag === "Left") {
            failures.push({ type: "indexer", message: indexerResult.left.message })
          } else {
            for (const item of indexerResult.right) {
              integrations.push({
                type: "indexer",
                id: item.id,
                name: item.name,
                enabled: item.enabled,
                status: normalizeHealth(item.health?.status, item.enabled),
                lastCheck: item.health?.lastCheck ?? null,
                message: item.health?.errorMessage ?? null,
              })
            }
          }

          if (clientResult._tag === "Left") {
            failures.push({ type: "download_client", message: clientResult.left.message })
          } else {
            for (const item of clientResult.right) {
              integrations.push({
                type: "download_client",
                id: item.id,
                name: item.name,
                enabled: item.enabled,
                status: normalizeHealth(item.health?.status, item.enabled),
                lastCheck: item.health?.lastCheck ?? null,
                message: item.health?.errorMessage ?? null,
              })
            }
          }

          if (serverResult._tag === "Left") {
            failures.push({ type: "media_server", message: serverResult.left.message })
          } else {
            for (const item of serverResult.right) {
              integrations.push({
                type: "media_server",
                id: item.id,
                name: item.name,
                enabled: item.enabled,
                status: normalizeHealth(item.health?.status, item.enabled),
                lastCheck: item.health?.lastCheck ?? null,
                message: item.health?.errorMessage ?? null,
              })
            }
          }

          return {
            status: worstStatus(integrations, failures),
            integrations,
            failures,
          }
        }),

      logs: (filters): Effect.Effect<ReadonlyArray<LogEntry>, DiagnosticsError> =>
        Effect.gen(function* () {
          const requestedCount = Math.min(Math.max(filters?.count ?? 100, 1), LOG_LIMIT)
          const rows = yield* Ref.get(logsRef).pipe(
            Effect.map((entries) =>
              entries
                .filter((entry) => !filters?.level || entry.level === filters.level)
                .slice(-requestedCount)
                .reverse(),
            ),
          )
          return rows
        }),

      log: (level, message, context) =>
        Effect.gen(function* () {
          const id = yield* Ref.getAndUpdate(nextLogIdRef, (current) => current + 1)
          const entry: LogEntry = {
            id,
            timestamp: new Date(),
            level,
            message,
            context: context ?? null,
          }
          yield* Ref.update(logsRef, (entries) => [...entries, entry].slice(-LOG_LIMIT))
        }),

      tasks: () =>
        Effect.gen(function* () {
          const [running, pending, failed, dead, byType] = yield* Effect.all([
            db
              .select({ value: count() })
              .from(schedulerJobs)
              .where(eq(schedulerJobs.status, "running"))
              .pipe(Effect.map((rows) => rows[0]?.value ?? 0)),
            db
              .select({ value: count() })
              .from(schedulerJobs)
              .where(eq(schedulerJobs.status, "pending"))
              .pipe(Effect.map((rows) => rows[0]?.value ?? 0)),
            db
              .select({ value: count() })
              .from(schedulerJobs)
              .where(eq(schedulerJobs.status, "failed"))
              .pipe(Effect.map((rows) => rows[0]?.value ?? 0)),
            db
              .select({ value: count() })
              .from(schedulerJobs)
              .where(eq(schedulerJobs.status, "dead"))
              .pipe(Effect.map((rows) => rows[0]?.value ?? 0)),
            schedulerService.status(),
          ])

          return { running, pending, failed, dead, byType }
        }),
    }
  }),
)

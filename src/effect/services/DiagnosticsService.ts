import { constants, existsSync, statSync } from "node:fs"
import { access, stat } from "node:fs/promises"
import { dirname } from "node:path"

import { SqlError } from "@effect/sql/SqlError"
import { count, desc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import {
  apiKeys,
  downloadClients,
  downloadQueue,
  indexers,
  mediaServers,
  movies,
  remotePathMappings,
  rootFolders,
  schedulerJobs,
  series,
  settings,
  systemLogs,
  type SystemLogLevel,
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
const HEALTH_STALE_MS = 24 * 60 * 60 * 1000
const FAILURE_ROLLUP_MIN_TOTAL = 3
const FAILURE_ROLLUP_RATIO = 0.5

export type LogLevel = SystemLogLevel
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
  readonly type:
    | "indexer"
    | "download_client"
    | "media_server"
    | "root_folder"
    | "remote_path_mapping"
    | "app_data"
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

function isStaleHealthCheck(lastCheck: Date | null, now: Date) {
  return lastCheck === null || now.getTime() - lastCheck.getTime() > HEALTH_STALE_MS
}

function hasFailureRollup(failed: number, total: number) {
  return total >= FAILURE_ROLLUP_MIN_TOTAL && failed / total >= FAILURE_ROLLUP_RATIO
}

async function directoryHealth(
  path: string,
  inaccessibleMessage: string,
): Promise<Pick<IntegrationHealthItem, "status" | "message">> {
  try {
    const stats = await stat(path)
    if (!stats.isDirectory()) {
      return {
        status: "unhealthy",
        message: "path exists but is not a directory",
      }
    }

    await access(path, constants.R_OK | constants.W_OK | constants.X_OK)
    return { status: "healthy", message: null }
  } catch (error) {
    const reason = error instanceof Error && error.message ? error.message : "unknown error"
    return {
      status: "unhealthy",
      message: `${inaccessibleMessage}: ${reason}`,
    }
  }
}

async function rootFolderHealth(
  path: string,
): Promise<Pick<IntegrationHealthItem, "status" | "message">> {
  return directoryHealth(path, "path is not accessible for media imports")
}

export const DiagnosticsServiceLive = Layer.effect(
  DiagnosticsService,
  Effect.gen(function* () {
    const db = yield* Db
    const indexerService = yield* IndexerService
    const downloadClientService = yield* DownloadClientService
    const mediaServerService = yield* MediaServerService
    const schedulerService = yield* SchedulerService

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
          const now = new Date()
          const [
            indexerResult,
            indexerStatsResult,
            clientResult,
            serverResult,
            rootFolderResult,
            mappingResult,
          ] = yield* Effect.all([
            Effect.either(indexerService.list()),
            Effect.either(indexerService.listStats()),
            Effect.either(downloadClientService.list()),
            Effect.either(mediaServerService.list()),
            Effect.either(db.select().from(rootFolders)),
            Effect.either(db.select().from(remotePathMappings)),
          ])

          const failures: Array<{ type: string; message: string }> = []
          const integrations: Array<IntegrationHealthItem> = []
          let enabledIndexerIds: ReadonlySet<number> | null = null

          if (indexerResult._tag === "Left") {
            failures.push({ type: "indexer", message: indexerResult.left.message })
          } else {
            enabledIndexerIds = new Set(
              indexerResult.right.filter((item) => item.enabled).map((item) => item.id),
            )
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
            if (
              indexerResult.right.length > 0 &&
              indexerResult.right.every((item) => !item.enabled)
            ) {
              failures.push({ type: "indexer", message: "all indexers are disabled" })
            }
          }

          if (indexerStatsResult._tag === "Left") {
            failures.push({ type: "indexer_stats", message: indexerStatsResult.left.message })
          } else {
            for (const stats of indexerStatsResult.right) {
              if (enabledIndexerIds !== null && !enabledIndexerIds.has(stats.indexerId)) continue

              if (hasFailureRollup(stats.failedSearches, stats.totalSearches)) {
                failures.push({
                  type: "indexer_search_failures",
                  message: `${stats.indexerName} has ${stats.failedSearches}/${stats.totalSearches} failed searches`,
                })
              }

              if (hasFailureRollup(stats.failedRss, stats.totalRss)) {
                failures.push({
                  type: "indexer_rss_failures",
                  message: `${stats.indexerName} has ${stats.failedRss}/${stats.totalRss} failed RSS syncs`,
                })
              }
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
            if (
              clientResult.right.length > 0 &&
              clientResult.right.every((item) => !item.enabled)
            ) {
              failures.push({
                type: "download_client",
                message: "all download clients are disabled",
              })
            }
            for (const item of clientResult.right) {
              if (item.enabled && item.health?.status === "unhealthy") {
                failures.push({
                  type: "download_client_unavailable",
                  message: `${item.name} is unavailable: ${item.health.errorMessage ?? "last connection test failed"}`,
                })
              }
              if (item.enabled && isStaleHealthCheck(item.health?.lastCheck ?? null, now)) {
                failures.push({
                  type: "download_client_health_stale",
                  message: `${item.name} has no recent health check`,
                })
              }
              if (item.enabled && item.settings.removeCompletedDownloads !== true) {
                failures.push({
                  type: "download_client_remove_completed",
                  message: `${item.name} leaves completed downloads in the client after import`,
                })
              }
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

          if (rootFolderResult._tag === "Left") {
            failures.push({ type: "root_folder", message: rootFolderResult.left.message })
          } else {
            if (rootFolderResult.right.length === 0) {
              failures.push({
                type: "root_folder",
                message: "no root folders are configured for media imports",
              })
            }
            const checked = yield* Effect.forEach(rootFolderResult.right, (folder) =>
              Effect.promise(() => rootFolderHealth(folder.path)).pipe(
                Effect.map((health) => ({
                  type: "root_folder" as const,
                  id: folder.id,
                  name: folder.path,
                  enabled: true,
                  status: health.status,
                  lastCheck: new Date(),
                  message: health.message,
                })),
              ),
            )
            integrations.push(...checked)
          }

          if (mappingResult._tag === "Left") {
            failures.push({ type: "remote_path_mapping", message: mappingResult.left.message })
          } else {
            const checkedMappings = yield* Effect.forEach(mappingResult.right, (mapping) =>
              Effect.promise(() =>
                directoryHealth(
                  mapping.localPath,
                  "local remote path mapping target is not accessible",
                ),
              ).pipe(
                Effect.map((health) => ({
                  type: "remote_path_mapping" as const,
                  id: mapping.id,
                  name: `${mapping.remotePath} -> ${mapping.localPath}`,
                  enabled: true,
                  status: health.status,
                  lastCheck: new Date(),
                  message: health.message,
                })),
              ),
            )
            integrations.push(...checkedMappings)
          }

          const appDataPath = dirname(DB_PATH)
          const appData = yield* Effect.promise(() =>
            directoryHealth(appDataPath, "app data path is not accessible"),
          )
          integrations.push({
            type: "app_data",
            id: 0,
            name: appDataPath,
            enabled: true,
            status: appData.status,
            lastCheck: new Date(),
            message: appData.message,
          })

          return {
            status: worstStatus(integrations, failures),
            integrations,
            failures,
          }
        }),

      logs: (filters): Effect.Effect<ReadonlyArray<LogEntry>, DiagnosticsError> =>
        Effect.gen(function* () {
          const requestedCount = Math.min(Math.max(filters?.count ?? 100, 1), LOG_LIMIT)
          return yield* db
            .select()
            .from(systemLogs)
            .where(filters?.level ? eq(systemLogs.level, filters.level) : undefined)
            .orderBy(desc(systemLogs.timestamp), desc(systemLogs.id))
            .limit(requestedCount)
            .pipe(
              Effect.mapError(
                (error) =>
                  new DiagnosticsError({
                    reason: "log_access_failed",
                    message: error.message,
                  }),
              ),
            )
        }),

      log: (level, message, context) =>
        db
          .insert(systemLogs)
          .values({ level, message, context: context ?? null, timestamp: new Date() })
          .pipe(
            Effect.asVoid,
            Effect.catchAll(() => Effect.void),
          ),

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

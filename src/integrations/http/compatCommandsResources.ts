import type { schedulerJobs } from "#/db/schema"
import type { SchedulerJobPayload, SchedulerJobType } from "#/effect/domain/scheduler"

export type SchedulerJobRow = typeof schedulerJobs.$inferSelect

export type CompatibleCommandStatus =
  | "queued"
  | "started"
  | "completed"
  | "failed"
  | "aborted"
  | "cancelled"
  | "orphaned"

export type CompatibleCommandResult = "unknown" | "successful" | "unsuccessful"
export type CompatibleCommandPriority = "low" | "normal" | "high"

export interface CompatibleCommandBody {
  readonly sendUpdatesToClient: boolean
  readonly updateScheduledTask: boolean
  readonly completionMessage: string
  readonly requiresDiskAccess: boolean
  readonly isExclusive: boolean
  readonly isLongRunning: boolean
  readonly name: string
  readonly lastExecutionTime: string | null
  readonly lastStartTime: string | null
  readonly trigger: string
  readonly suppressMessages: boolean
  readonly [key: string]: unknown
}

export interface CompatibleCommandResource {
  readonly id: number
  readonly name: string
  readonly commandName: string
  readonly message: string
  readonly body: CompatibleCommandBody
  readonly priority: CompatibleCommandPriority
  readonly status: CompatibleCommandStatus
  readonly result: CompatibleCommandResult
  readonly queued: string
  readonly started: string | null
  readonly ended: string | null
  readonly duration: string | null
  readonly exception: string | null
  readonly trigger: string
  readonly clientUserAgent: string | null
  readonly stateChangeTime: string | null
  readonly sendUpdatesToClient: boolean
  readonly updateScheduledTask: boolean
  readonly lastExecutionTime: string | null
}

export function commandResource(job: SchedulerJobRow): CompatibleCommandResource {
  const name = commandNameForJob(job)
  const started = job.startedAt?.toISOString() ?? null
  const ended = job.completedAt?.toISOString() ?? null
  const lastExecutionTime = job.completedAt?.toISOString() ?? null

  return {
    id: job.id,
    name,
    commandName: splitCamelCase(name),
    message: commandMessage(job),
    body: {
      sendUpdatesToClient: true,
      updateScheduledTask: false,
      completionMessage: "Completed",
      requiresDiskAccess: false,
      isExclusive: false,
      isLongRunning: isLongRunning(job.jobType),
      name,
      lastExecutionTime,
      lastStartTime: started,
      trigger: "manual",
      suppressMessages: false,
      ...payloadBodyFields(job.payload),
    },
    priority: "normal",
    status: commandStatus(job.status),
    result: commandResult(job.status),
    queued: job.createdAt.toISOString(),
    started,
    ended,
    duration: commandDuration(job),
    exception: job.errorMessage,
    trigger: "manual",
    clientUserAgent: null,
    stateChangeTime: started ?? ended,
    sendUpdatesToClient: true,
    updateScheduledTask: false,
    lastExecutionTime,
  }
}

export function commandStatus(status: string): CompatibleCommandStatus {
  switch (status) {
    case "pending":
      return "queued"
    case "running":
      return "started"
    case "completed":
      return "completed"
    case "failed":
    case "dead":
      return "failed"
    default:
      return "orphaned"
  }
}

export function commandResult(status: string): CompatibleCommandResult {
  switch (status) {
    case "completed":
      return "successful"
    case "failed":
    case "dead":
      return "unsuccessful"
    default:
      return "unknown"
  }
}

export function commandNameForJob(job: Pick<SchedulerJobRow, "jobType" | "payload">): string {
  switch (job.payload._tag) {
    case "rss_sync":
      return "RssSync"
    case "search_missing":
      return "MoviesSearch"
    case "search_cutoff":
      return "CutoffUnmetMoviesSearch"
    case "download_monitor":
      return "RefreshMonitoredDownloads"
    case "indexer_definition_refresh":
      return "IndexerDefinitionUpdate"
    case "indexer_application_sync":
      return "ApplicationIndexerSync"
    case "movie_metadata_refresh":
      return "RefreshMovie"
    case "series_metadata_refresh":
      return "RefreshSeries"
    case "database_backup":
      return "Backup"
    case "housekeeping":
      return "Housekeeping"
    case "tv_rss_sync":
      return "RssSync"
    case "tv_search_cutoff":
      return "CutoffUnmetEpisodeSearch"
    case "tv_search_series":
      return "SeriesSearch"
    case "tv_search_season":
      return "SeasonSearch"
    case "tv_search_episode":
      return "EpisodeSearch"
    default:
      return splitSnakeCase(job.jobType)
  }
}

function payloadBodyFields(payload: SchedulerJobPayload): Record<string, unknown> {
  switch (payload._tag) {
    case "search_missing":
      return { movieId: payload.movieId, movieIds: [payload.movieId] }
    case "tv_search_series":
      return { seriesId: payload.seriesId }
    case "tv_search_season":
      return { seasonId: payload.seasonId }
    case "tv_search_episode":
      return { episodeId: payload.episodeId, episodeIds: [payload.episodeId] }
    default:
      return {}
  }
}

function commandMessage(job: SchedulerJobRow): string {
  if (job.errorMessage) return job.errorMessage
  switch (commandStatus(job.status)) {
    case "queued":
      return "Queued"
    case "started":
      return "Running"
    case "completed":
      return "Completed"
    case "failed":
      return "Failed"
    default:
      return "Unknown"
  }
}

function isLongRunning(jobType: SchedulerJobType): boolean {
  switch (jobType) {
    case "rss_sync":
    case "search_cutoff":
    case "tv_rss_sync":
    case "tv_search_cutoff":
    case "movie_metadata_refresh":
    case "series_metadata_refresh":
    case "database_backup":
    case "housekeeping":
      return true
    default:
      return false
  }
}

function commandDuration(job: SchedulerJobRow): string | null {
  if (!job.startedAt || !job.completedAt) return null
  const seconds = Math.max(
    0,
    Math.floor((job.completedAt.getTime() - job.startedAt.getTime()) / 1000),
  )
  return timeSpan(seconds)
}

function timeSpan(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function splitCamelCase(value: string): string {
  return value.replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
}

function splitSnakeCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join("")
}

// ── Scheduler Job Types ──

export type SchedulerJobType =
  | "rss_sync"
  | "search_missing"
  | "search_cutoff"
  | "download_monitor"
  | "tv_rss_sync"
  | "tv_search_cutoff"
  | "tv_search_series"
  | "tv_search_season"
  | "tv_search_episode"

/**
 * State machine: pending → running → completed | failed
 * On failure: if attempts < maxAttempts → pending (retry), else → dead
 */
export type SchedulerJobStatus = "pending" | "running" | "completed" | "failed" | "dead"

// ── Discriminated payload union ──

export type SchedulerJobPayload =
  | { readonly _tag: "rss_sync" }
  | { readonly _tag: "search_missing"; readonly movieId: number }
  | { readonly _tag: "search_cutoff" }
  | { readonly _tag: "download_monitor" }
  | { readonly _tag: "tv_rss_sync" }
  | { readonly _tag: "tv_search_cutoff" }
  | { readonly _tag: "tv_search_series"; readonly seriesId: number }
  | { readonly _tag: "tv_search_season"; readonly seasonId: number }
  | { readonly _tag: "tv_search_episode"; readonly episodeId: number }

// ── Dedupe key builders ──

export function dedupeKey(payload: SchedulerJobPayload): string {
  switch (payload._tag) {
    case "rss_sync":
      return "rss_sync"
    case "search_missing":
      return `search_missing:movie:${payload.movieId}`
    case "search_cutoff":
      return "search_cutoff"
    case "download_monitor":
      return "download_monitor"
    case "tv_rss_sync":
      return "tv_rss_sync"
    case "tv_search_cutoff":
      return "tv_search_cutoff"
    case "tv_search_series":
      return `tv_search_series:${payload.seriesId}`
    case "tv_search_season":
      return `tv_search_season:${payload.seasonId}`
    case "tv_search_episode":
      return `tv_search_episode:${payload.episodeId}`
  }
}

export function jobTypeFromPayload(payload: SchedulerJobPayload): SchedulerJobType {
  return payload._tag
}

// ── Config shape ──

export interface SchedulerJobConfig {
  readonly jobType: SchedulerJobType
  readonly intervalMinutes: number
  readonly retryDelaySeconds: number
  readonly maxRetries: number
  readonly backoffMultiplier: number
  readonly enabled: boolean
}

// ── Default configs ──

export const DEFAULT_CONFIGS: ReadonlyArray<SchedulerJobConfig> = [
  {
    jobType: "rss_sync",
    intervalMinutes: 20,
    retryDelaySeconds: 60,
    maxRetries: 3,
    backoffMultiplier: 2,
    enabled: true,
  },
  {
    jobType: "search_missing",
    intervalMinutes: 0,
    retryDelaySeconds: 120,
    maxRetries: 3,
    backoffMultiplier: 2,
    enabled: true,
  },
  {
    jobType: "search_cutoff",
    intervalMinutes: 360,
    retryDelaySeconds: 120,
    maxRetries: 3,
    backoffMultiplier: 2,
    enabled: true,
  },
  {
    jobType: "download_monitor",
    intervalMinutes: 1,
    retryDelaySeconds: 30,
    maxRetries: 5,
    backoffMultiplier: 1.5,
    enabled: true,
  },
  {
    jobType: "tv_rss_sync",
    intervalMinutes: 20,
    retryDelaySeconds: 60,
    maxRetries: 3,
    backoffMultiplier: 2,
    enabled: true,
  },
  {
    jobType: "tv_search_cutoff",
    intervalMinutes: 360,
    retryDelaySeconds: 120,
    maxRetries: 3,
    backoffMultiplier: 2,
    enabled: true,
  },
]

// ── Air-date gating ──

/** Delay after air date before triggering a search for a new episode. */
export const DEFAULT_AIR_DATE_DELAY_MINUTES = 30

// ── Job status summary ──

export interface JobTypeSummary {
  readonly jobType: SchedulerJobType
  readonly enabled: boolean
  readonly intervalMinutes: number
  readonly activeCount: number
  readonly lastCompletedAt: Date | null
  readonly nextRunAt: Date | null
}

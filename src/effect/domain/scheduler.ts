// ── Scheduler Job Types ──

export type SchedulerJobType = "rss_sync" | "search_missing" | "search_cutoff" | "download_monitor"

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
]

// ── Job status summary ──

export interface JobTypeSummary {
  readonly jobType: SchedulerJobType
  readonly enabled: boolean
  readonly intervalMinutes: number
  readonly activeCount: number
  readonly lastCompletedAt: Date | null
  readonly nextRunAt: Date | null
}

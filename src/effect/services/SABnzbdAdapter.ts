import { Effect } from "effect"

import type {
  AdapterMetadata,
  DownloadClientConfig,
  DownloadStatus,
  NormalizedDownloadStatus,
} from "../domain/downloadClient"
import { DownloadClientError, type DownloadClientErrorReason } from "../errors"
import type { DownloadClientAdapter } from "./DownloadClientAdapter"

// ── Metadata ──

export const sabnzbdMetadata: AdapterMetadata = {
  displayName: "SABnzbd",
  protocolAffinity: "usenet",
  defaultPort: 8080,
  authModel: "API key (stored in password field)",
}

// ── SABnzbd state → normalized status ──

const SAB_STATUS_MAP: Record<string, NormalizedDownloadStatus> = {
  // downloading
  Downloading: "downloading",
  Grabbing: "downloading",
  Fetching: "downloading",
  // queued
  Queued: "queued",
  Paused: "queued",
  Propagating: "queued",
  Idle: "queued",
  // importing (post-processing)
  Repairing: "importing",
  Extracting: "importing",
  Verifying: "importing",
  Moving: "importing",
  Running: "importing",
  // completed
  Completed: "completed",
  // failed
  Failed: "failed",
}

// ── SABnzbd API response types ──

interface SabQueueSlot {
  readonly nzo_id: string
  readonly filename: string
  readonly status: string
  readonly mb: string
  readonly mbleft: string
  readonly percentage: string
  readonly timeleft: string
  readonly cat: string
}

interface SabQueueResponse {
  readonly queue: {
    readonly slots: ReadonlyArray<SabQueueSlot>
    readonly diskspace2: string
    readonly version: string
  }
}

interface SabHistorySlot {
  readonly nzo_id: string
  readonly name: string
  readonly status: string
  readonly bytes: number
  readonly fail_message: string
  readonly category: string
}

interface SabHistoryResponse {
  readonly history: {
    readonly slots: ReadonlyArray<SabHistorySlot>
  }
}

interface SabVersionResponse {
  readonly version: string
}

interface SabAddUrlResponse {
  readonly status: boolean
  readonly nzo_ids: ReadonlyArray<string>
  readonly error?: string
}

interface SabSimpleResponse {
  readonly status: boolean
  readonly error?: string
}

interface SabCategoriesResponse {
  readonly categories: ReadonlyArray<string>
}

// ── Helpers ──

function baseUrl(config: DownloadClientConfig): string {
  const scheme = config.useSsl ? "https" : "http"
  return `${scheme}://${config.host}:${config.port}`
}

function makeError(
  config: DownloadClientConfig,
  reason: DownloadClientErrorReason,
  message: string,
  retryable: boolean,
): DownloadClientError {
  return new DownloadClientError({
    clientId: config.id,
    clientName: config.name,
    reason,
    message,
    retryable,
  })
}

function mapSabStatus(status: string): NormalizedDownloadStatus {
  return SAB_STATUS_MAP[status] ?? "failed"
}

/** Parse SABnzbd timeleft "H:MM:SS" → seconds, or null if unavailable. */
function parseTimeleft(timeleft: string): number | null {
  const parts = timeleft.split(":")
  if (parts.length !== 3) return null
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const s = parseInt(parts[2], 10)
  if (isNaN(h) || isNaN(m) || isNaN(s)) return null
  const total = h * 3600 + m * 60 + s
  return total === 0 ? null : total
}

// ── Factory ──

export function createSABnzbdAdapter(config: DownloadClientConfig): DownloadClientAdapter {
  const base = baseUrl(config)
  // API key stored in the password field
  const apiKey = config.password

  const sabFetch = <T>(params: Record<string, string>): Effect.Effect<T, DownloadClientError> =>
    Effect.tryPromise({
      try: async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)
        try {
          const searchParams = new URLSearchParams({
            ...params,
            apikey: apiKey,
            output: "json",
          })
          const res = await fetch(`${base}/api?${searchParams.toString()}`, {
            signal: controller.signal,
          })

          if (res.status === 401 || res.status === 403) {
            throw Object.assign(new Error("auth failed"), { authFailed: true })
          }
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }

          const json = await res.json()

          // SABnzbd returns 200 with { status: false, error: "..." } for auth errors
          if (
            typeof json === "object" &&
            json !== null &&
            "status" in json &&
            json.status === false &&
            "error" in json &&
            typeof json.error === "string"
          ) {
            const errMsg = json.error as string
            if (errMsg.toLowerCase().includes("api key")) {
              throw Object.assign(new Error(errMsg), { authFailed: true })
            }
            throw new Error(errMsg)
          }

          return json as T
        } finally {
          clearTimeout(timeout)
        }
      },
      catch: (e) => {
        if (e instanceof Error && e.name === "AbortError") {
          return makeError(config, "timeout", "request timed out after 15s", true)
        }
        if ((e as Record<string, unknown>).authFailed) {
          return makeError(config, "auth_failed", "invalid API key", false)
        }
        return makeError(
          config,
          "connection_refused",
          e instanceof Error ? e.message : "request failed",
          true,
        )
      },
    })

  const ensureCategory = (category: string): Effect.Effect<void, DownloadClientError> =>
    Effect.gen(function* () {
      const cats = yield* sabFetch<SabCategoriesResponse>({ mode: "get_cats" })
      if (cats.categories.includes(category)) return

      // SABnzbd auto-creates categories when used in addurl, but we can also
      // set one up explicitly via config. Since there's no dedicated create-category
      // API, we rely on SABnzbd's auto-creation behavior on first use.
    })

  return {
    testConnection: () =>
      Effect.gen(function* () {
        const versionData = yield* sabFetch<SabVersionResponse>({ mode: "version" })
        const queueData = yield* sabFetch<SabQueueResponse>({ mode: "queue", limit: "0" })

        if (config.category) {
          yield* ensureCategory(config.category)
        }

        const freeSpaceGb = parseFloat(queueData.queue.diskspace2)
        const freeSpaceBytes = isNaN(freeSpaceGb) ? null : Math.round(freeSpaceGb * 1024 ** 3)

        return {
          connected: true,
          version: versionData.version,
          freeSpaceBytes,
          errorMessage: null,
        }
      }),

    addDownload: (url, options) =>
      Effect.gen(function* () {
        const category = options?.category ?? config.category
        const params: Record<string, string> = { mode: "addurl", name: url }
        if (category) params.cat = category

        const result = yield* sabFetch<SabAddUrlResponse>(params)

        if (!result.status || result.nzo_ids.length === 0) {
          return yield* new DownloadClientError({
            clientId: config.id,
            clientName: config.name,
            reason: "download_rejected",
            message: result.error ?? "SABnzbd rejected the NZB",
            retryable: false,
          })
        }

        return result.nzo_ids[0]
      }),

    getQueue: () =>
      Effect.gen(function* () {
        const [queueData, historyData] = yield* Effect.all([
          sabFetch<SabQueueResponse>({ mode: "queue" }),
          sabFetch<SabHistoryResponse>({ mode: "history" }),
        ])

        const queueItems: Array<DownloadStatus> = queueData.queue.slots.map((slot) => {
          const totalMb = parseFloat(slot.mb)
          const leftMb = parseFloat(slot.mbleft)
          const sizeBytes = isNaN(totalMb) ? 0 : Math.round(totalMb * 1024 * 1024)
          const progress = isNaN(totalMb) || totalMb === 0 ? 0 : (totalMb - leftMb) / totalMb

          return {
            externalId: slot.nzo_id,
            title: slot.filename,
            status: mapSabStatus(slot.status),
            sizeBytes,
            progressFraction: Math.max(0, Math.min(1, progress)),
            etaSeconds: parseTimeleft(slot.timeleft),
            errorMessage: null,
            downloadClientId: config.id,
          }
        })

        const historyItems: Array<DownloadStatus> = historyData.history.slots.map((slot) => ({
          externalId: slot.nzo_id,
          title: slot.name,
          status: mapSabStatus(slot.status),
          sizeBytes: slot.bytes,
          progressFraction: slot.status === "Completed" ? 1 : 0,
          etaSeconds: null,
          errorMessage: slot.fail_message || null,
          downloadClientId: config.id,
        }))

        return [...queueItems, ...historyItems]
      }),

    removeDownload: (externalId, deleteFiles) =>
      Effect.gen(function* () {
        // Try queue first, then history — SABnzbd separates active vs completed
        const delFiles = deleteFiles ? "1" : "0"

        const queueResult = yield* sabFetch<SabSimpleResponse>({
          mode: "queue",
          name: "delete",
          value: externalId,
          del_files: delFiles,
        }).pipe(Effect.catchAll(() => Effect.succeed({ status: false } as SabSimpleResponse)))

        if (!queueResult.status) {
          yield* sabFetch<SabSimpleResponse>({
            mode: "history",
            name: "delete",
            value: externalId,
            del_files: delFiles,
          })
        }
      }),

    getHealth: () =>
      Effect.gen(function* () {
        const version = yield* sabFetch<SabVersionResponse>({ mode: "version" }).pipe(
          Effect.map((v) => v.version),
          Effect.catchAll(() => Effect.succeed(null as string | null)),
        )

        const freeSpace = yield* sabFetch<SabQueueResponse>({ mode: "queue", limit: "0" }).pipe(
          Effect.map((q) => {
            const gb = parseFloat(q.queue.diskspace2)
            return isNaN(gb) ? null : Math.round(gb * 1024 ** 3)
          }),
          Effect.catchAll(() => Effect.succeed(null as number | null)),
        )

        return {
          connected: version !== null,
          version,
          freeSpaceBytes: freeSpace,
          errorMessage: version === null ? "failed to connect" : null,
        }
      }),
  }
}

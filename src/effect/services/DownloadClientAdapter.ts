import { Effect } from "effect"

import type {
  AddDownloadOptions,
  DownloadClientConfig,
  DownloadClientHealth,
  DownloadStatus,
  NormalizedDownloadStatus,
} from "../domain/downloadClient"
import { DownloadClientError, type DownloadClientErrorReason } from "../errors"

// ── Interface ──

export interface DownloadClientAdapter {
  readonly testConnection: () => Effect.Effect<DownloadClientHealth, DownloadClientError>
  readonly addDownload: (
    url: string,
    options?: AddDownloadOptions,
  ) => Effect.Effect<string, DownloadClientError>
  readonly getQueue: () => Effect.Effect<ReadonlyArray<DownloadStatus>, DownloadClientError>
  readonly removeDownload: (
    externalId: string,
    deleteFiles: boolean,
  ) => Effect.Effect<void, DownloadClientError>
  readonly getHealth: () => Effect.Effect<DownloadClientHealth, DownloadClientError>
}

// ── qBittorrent state → normalized status ──

const QBIT_STATUS_MAP: Record<string, NormalizedDownloadStatus> = {
  // queued
  queuedDL: "queued",
  checkingResumeData: "queued",
  allocating: "queued",
  pausedDL: "queued",
  // downloading
  metaDL: "downloading",
  downloading: "downloading",
  forcedDL: "downloading",
  stalledDL: "downloading",
  checkingDL: "downloading",
  // completed
  uploading: "completed",
  stalledUP: "completed",
  forcedUP: "completed",
  queuedUP: "completed",
  checkingUP: "completed",
  pausedUP: "completed",
  // importing
  moving: "importing",
  // failed
  missingFiles: "failed",
  error: "failed",
  unknown: "failed",
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

function extractInfohashFromMagnet(magnetUri: string): string | null {
  const match = /urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i.exec(magnetUri)
  return match ? match[1].toLowerCase() : null
}

// ── qBittorrent types ──

interface QBitTorrent {
  readonly hash: string
  readonly name: string
  readonly state: string
  readonly size: number
  readonly progress: number
  readonly eta: number
  readonly dlspeed: number
}

interface QBitMainData {
  readonly server_state?: {
    readonly free_space_on_disk?: number
  }
}

// ── Factory ──

export function createQBittorrentAdapter(config: DownloadClientConfig): DownloadClientAdapter {
  const base = baseUrl(config)
  let sid: string | null = null

  const login = (): Effect.Effect<void, DownloadClientError> =>
    Effect.tryPromise({
      try: async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)
        try {
          const body = new URLSearchParams({
            username: config.username,
            password: config.password,
          })
          const res = await fetch(`${base}/api/v2/auth/login`, {
            method: "POST",
            body,
            signal: controller.signal,
          })
          const text = await res.text()
          if (text.trim() !== "Ok.") {
            throw Object.assign(new Error("auth failed"), { authFailed: true })
          }
          const cookie = res.headers.get("set-cookie")
          if (cookie) {
            const match = /SID=([^;]+)/.exec(cookie)
            if (match) sid = match[1]
          }
        } finally {
          clearTimeout(timeout)
        }
      },
      catch: (e) => {
        if (e instanceof Error && e.name === "AbortError") {
          return makeError(config, "timeout", "login timed out after 15s", true)
        }
        if ((e as Record<string, unknown>).authFailed) {
          return makeError(config, "auth_failed", "invalid username or password", false)
        }
        return makeError(
          config,
          "connection_refused",
          e instanceof Error ? e.message : "login failed",
          true,
        )
      },
    })

  const qbitFetch = (
    path: string,
    init?: RequestInit,
  ): Effect.Effect<Response, DownloadClientError> =>
    Effect.gen(function* () {
      if (!sid) yield* login()

      const doFetch = (retrySid: string | null): Effect.Effect<Response, DownloadClientError> =>
        Effect.tryPromise({
          try: async () => {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 15_000)
            try {
              const headers: Record<string, string> = {
                ...(init?.headers as Record<string, string> | undefined),
              }
              if (retrySid) headers.Cookie = `SID=${retrySid}`
              const res = await fetch(`${base}${path}`, {
                ...init,
                headers,
                signal: controller.signal,
              })
              if (res.status === 403) {
                throw Object.assign(new Error("forbidden"), { status: 403 })
              }
              if (!res.ok) {
                throw new Error(`HTTP ${res.status}`)
              }
              return res
            } finally {
              clearTimeout(timeout)
            }
          },
          catch: (e) => {
            if (e instanceof Error && e.name === "AbortError") {
              return makeError(config, "timeout", `request to ${path} timed out`, true)
            }
            if ((e as Record<string, unknown>).status === 403) {
              return makeError(config, "auth_failed", "session expired", true)
            }
            return makeError(
              config,
              "connection_refused",
              e instanceof Error ? e.message : "request failed",
              true,
            )
          },
        })

      const res = yield* doFetch(sid)
      return res
    }).pipe(
      // auto re-login on 403
      Effect.catchIf(
        (e) => e.reason === "auth_failed" && e.retryable,
        () =>
          Effect.gen(function* () {
            sid = null
            yield* login()
            return yield* Effect.tryPromise({
              try: async () => {
                const headers: Record<string, string> = {
                  ...(init?.headers as Record<string, string> | undefined),
                }
                if (sid) headers.Cookie = `SID=${sid}`
                const res = await fetch(`${base}${path}`, { ...init, headers })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return res
              },
              catch: (e) =>
                makeError(
                  config,
                  "connection_refused",
                  e instanceof Error ? e.message : "retry failed",
                  false,
                ),
            })
          }),
      ),
    )

  const qbitJson = <T>(path: string): Effect.Effect<T, DownloadClientError> =>
    Effect.gen(function* () {
      const res = yield* qbitFetch(path)
      return yield* Effect.tryPromise({
        try: () => res.json() as Promise<T>,
        catch: () =>
          makeError(config, "invalid_response", `failed to parse JSON from ${path}`, false),
      })
    })

  const qbitText = (path: string): Effect.Effect<string, DownloadClientError> =>
    Effect.gen(function* () {
      const res = yield* qbitFetch(path)
      return yield* Effect.tryPromise({
        try: () => res.text(),
        catch: () =>
          makeError(config, "invalid_response", `failed to read text from ${path}`, false),
      })
    })

  const ensureCategory = (category: string): Effect.Effect<void, DownloadClientError> =>
    Effect.gen(function* () {
      if (!sid) yield* login()

      yield* Effect.tryPromise({
        try: async () => {
          const headers: Record<string, string> = {}
          if (sid) headers.Cookie = `SID=${sid}`
          const res = await fetch(`${base}/api/v2/torrents/createCategory`, {
            method: "POST",
            body: new URLSearchParams({ category, savePath: "" }),
            headers,
          })
          // 200 = created, 409 = already exists — both fine
          if (res.ok || res.status === 409) return
          throw new Error(`HTTP ${res.status}`)
        },
        catch: (e) =>
          makeError(
            config,
            "category_create_failed",
            e instanceof Error ? e.message : `failed to create category '${category}'`,
            false,
          ),
      })
    })

  const mapTorrentStatus = (state: string): NormalizedDownloadStatus =>
    QBIT_STATUS_MAP[state] ?? "failed"

  return {
    testConnection: () =>
      Effect.gen(function* () {
        yield* login()
        const version = yield* qbitText("/api/v2/app/version")
        const mainData = yield* qbitJson<QBitMainData>("/api/v2/sync/maindata?rid=0")

        if (config.category) {
          yield* ensureCategory(config.category)
        }

        return {
          connected: true,
          version: version.trim(),
          freeSpaceBytes: mainData.server_state?.free_space_on_disk ?? null,
          errorMessage: null,
        }
      }),

    addDownload: (url, options) =>
      Effect.gen(function* () {
        const category = options?.category ?? config.category
        if (category) {
          yield* ensureCategory(category)
        }

        // Try to extract infohash from magnet before adding
        const knownHash = extractInfohashFromMagnet(url)

        // Snapshot existing torrents if we can't extract hash from magnet
        let beforeHashes: ReadonlyArray<string> | null = null
        if (!knownHash) {
          const before = yield* qbitJson<ReadonlyArray<QBitTorrent>>("/api/v2/torrents/info")
          beforeHashes = before.map((t) => t.hash)
        }

        const body = new URLSearchParams({ urls: url })
        if (category) body.set("category", category)
        if (options?.savePath) body.set("savepath", options.savePath)

        const res = yield* qbitFetch("/api/v2/torrents/add", {
          method: "POST",
          body,
        })
        const text = yield* Effect.tryPromise({
          try: () => res.text(),
          catch: () => makeError(config, "invalid_response", "failed to read add response", false),
        })

        if (text.trim() === "Fails.") {
          return yield* new DownloadClientError({
            clientId: config.id,
            clientName: config.name,
            reason: "download_rejected",
            message: "qBittorrent rejected the download",
            retryable: false,
          })
        }

        if (knownHash) return knownHash

        // Diff torrent list to recover hash
        // Small delay for qBit to process
        yield* Effect.tryPromise({
          try: () => new Promise<void>((resolve) => setTimeout(resolve, 500)),
          catch: () => makeError(config, "invalid_response", "unexpected", false),
        })

        const after = yield* qbitJson<ReadonlyArray<QBitTorrent>>("/api/v2/torrents/info")
        const newTorrent = after.find(
          (t) => beforeHashes !== null && !beforeHashes.includes(t.hash),
        )
        return newTorrent?.hash ?? "unknown"
      }),

    getQueue: () =>
      Effect.gen(function* () {
        const torrents = yield* qbitJson<ReadonlyArray<QBitTorrent>>("/api/v2/torrents/info")
        return torrents.map(
          (t): DownloadStatus => ({
            externalId: t.hash,
            title: t.name,
            status: mapTorrentStatus(t.state),
            sizeBytes: t.size,
            progressFraction: t.progress,
            etaSeconds: t.eta === 8640000 ? null : t.eta,
            errorMessage: t.state === "error" || t.state === "missingFiles" ? t.state : null,
            downloadClientId: config.id,
          }),
        )
      }),

    removeDownload: (externalId, deleteFiles) =>
      Effect.gen(function* () {
        const body = new URLSearchParams({
          hashes: externalId,
          deleteFiles: deleteFiles ? "true" : "false",
        })
        yield* qbitFetch("/api/v2/torrents/delete", {
          method: "POST",
          body,
        })
      }),

    getHealth: () =>
      Effect.gen(function* () {
        const version = yield* qbitText("/api/v2/app/version").pipe(
          Effect.map((v) => v.trim()),
          Effect.catchAll(() => Effect.succeed(null as string | null)),
        )
        const mainData = yield* qbitJson<QBitMainData>("/api/v2/sync/maindata?rid=0").pipe(
          Effect.catchAll(() => Effect.succeed(null as QBitMainData | null)),
        )

        return {
          connected: version !== null,
          version,
          freeSpaceBytes: mainData?.server_state?.free_space_on_disk ?? null,
          errorMessage: version === null ? "failed to connect" : null,
        }
      }),
  }
}

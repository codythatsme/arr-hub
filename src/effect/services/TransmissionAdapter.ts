import { Buffer } from "node:buffer"

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

export const transmissionMetadata: AdapterMetadata = {
  displayName: "Transmission",
  protocolAffinity: "torrent",
  defaultPort: 9091,
  authModel: "username/password",
}

// ── Transmission RPC types ──

interface TransmissionResponse<T> {
  readonly result: string
  readonly arguments: T
}

interface TransmissionSessionArgs {
  readonly version?: string
  readonly "rpc-version"?: number
  readonly "download-dir-free-space"?: number
}

interface TransmissionTorrent {
  readonly id: number
  readonly hashString: string
  readonly name: string
  readonly downloadDir: string
  readonly totalSize: number
  readonly leftUntilDone: number
  readonly isFinished: boolean
  readonly eta: number
  readonly status: number
  readonly errorString?: string
  readonly labels?: ReadonlyArray<string>
  readonly percentDone?: number
}

interface TransmissionTorrentGetArgs {
  readonly torrents: ReadonlyArray<TransmissionTorrent>
}

interface TransmissionTorrentAddArgs {
  readonly "torrent-added"?: {
    readonly hashString?: string
    readonly id?: number
    readonly name?: string
  }
  readonly "torrent-duplicate"?: {
    readonly hashString?: string
    readonly id?: number
    readonly name?: string
  }
}

// ── Helpers ──

function baseUrl(config: DownloadClientConfig): string {
  const scheme = config.useSsl ? "https" : "http"
  return `${scheme}://${config.host}:${config.port}/transmission/rpc`
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

function basicAuthHeader(config: DownloadClientConfig): string | null {
  if (config.username.length === 0 && config.password.length === 0) return null
  return `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`
}

function outputPath(torrent: TransmissionTorrent): string {
  const base = torrent.downloadDir.replace(/\/+$/, "")
  const safeName = torrent.name.replaceAll(":", "_")
  return `${base}/${safeName}`
}

function progressFraction(torrent: TransmissionTorrent): number {
  if (typeof torrent.percentDone === "number") {
    return Math.max(0, Math.min(1, torrent.percentDone))
  }
  if (torrent.totalSize <= 0) return 0
  const progress = (torrent.totalSize - torrent.leftUntilDone) / torrent.totalSize
  return Math.max(0, Math.min(1, progress))
}

function mapTransmissionStatus(torrent: TransmissionTorrent): NormalizedDownloadStatus {
  if (torrent.errorString && torrent.errorString.trim().length > 0) return "failed"
  if (torrent.totalSize === 0) return "queued"
  if (
    torrent.leftUntilDone === 0 &&
    (torrent.status === 0 || torrent.status === 5 || torrent.status === 6)
  ) {
    return "completed"
  }
  if (torrent.isFinished && torrent.status !== 1 && torrent.status !== 2) return "completed"
  if (torrent.status === 0 || torrent.status === 3) return "queued"
  return "downloading"
}

function addArgs(
  url: string,
  config: DownloadClientConfig,
  savePath: string | undefined,
): Record<string, unknown> {
  const args: Record<string, unknown> = { filename: url }
  const downloadDir = savePath?.trim()
  if (downloadDir) args["download-dir"] = downloadDir
  const category = config.category?.trim()
  if (category) args.labels = [category]
  return args
}

// ── Factory ──

export function createTransmissionAdapter(config: DownloadClientConfig): DownloadClientAdapter {
  const url = baseUrl(config)
  const authHeader = basicAuthHeader(config)
  let sessionId: string | null = null

  const rpcRequest = <T>(
    method: string,
    args?: Record<string, unknown>,
  ): Effect.Effect<T, DownloadClientError> =>
    Effect.tryPromise({
      try: async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)
        try {
          const body = JSON.stringify(args ? { method, arguments: args } : { method })
          const headers = new Headers({
            "content-type": "application/json",
            ...(authHeader ? { authorization: authHeader } : {}),
            ...(sessionId ? { "x-transmission-session-id": sessionId } : {}),
          })

          const send = () =>
            fetch(url, {
              method: "POST",
              headers,
              body,
              signal: controller.signal,
            })

          let response = await send()
          if (response.status === 409) {
            const nextSessionId = response.headers.get("x-transmission-session-id")
            if (!nextSessionId) {
              throw Object.assign(new Error("missing Transmission session id"), {
                invalidResponse: true,
              })
            }
            sessionId = nextSessionId
            headers.set("x-transmission-session-id", nextSessionId)
            response = await send()
          }

          if (response.status === 401 || response.status === 403) {
            throw Object.assign(new Error(`HTTP ${response.status}`), { authFailed: true })
          }
          if (!response.ok) throw new Error(`HTTP ${response.status}`)

          const payload = (await response.json()) as TransmissionResponse<T>
          if (payload.result !== "success") {
            throw Object.assign(new Error(payload.result), { invalidResponse: true })
          }

          return payload.arguments
        } finally {
          clearTimeout(timeout)
        }
      },
      catch: (error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return makeError(config, "timeout", "request timed out after 15s", true)
        }
        if ((error as Record<string, unknown>).authFailed) {
          return makeError(config, "auth_failed", "invalid Transmission credentials", false)
        }
        if ((error as Record<string, unknown>).invalidResponse) {
          return makeError(
            config,
            "invalid_response",
            error instanceof Error ? error.message : "invalid Transmission response",
            false,
          )
        }
        return makeError(
          config,
          "connection_refused",
          error instanceof Error ? error.message : "request failed",
          true,
        )
      },
    })

  const getSession = () => rpcRequest<TransmissionSessionArgs>("session-get")

  const getTorrents = () =>
    rpcRequest<TransmissionTorrentGetArgs>("torrent-get", {
      fields: [
        "id",
        "hashString",
        "name",
        "downloadDir",
        "totalSize",
        "leftUntilDone",
        "isFinished",
        "eta",
        "status",
        "errorString",
        "labels",
        "percentDone",
      ],
    })

  return {
    testConnection: () =>
      Effect.gen(function* () {
        const session = yield* getSession()
        return {
          connected: true,
          version: session.version ?? null,
          freeSpaceBytes: session["download-dir-free-space"] ?? null,
          errorMessage: null,
        }
      }),

    addDownload: (downloadUrl, options) =>
      Effect.gen(function* () {
        const result = yield* rpcRequest<TransmissionTorrentAddArgs>(
          "torrent-add",
          addArgs(downloadUrl, config, options?.savePath),
        )
        const torrent = result["torrent-added"] ?? result["torrent-duplicate"]
        const hash = torrent?.hashString
        if (!hash) {
          return yield* makeError(
            config,
            "invalid_response",
            "Transmission did not return a torrent hash",
            false,
          )
        }
        return hash
      }),

    getQueue: () =>
      Effect.gen(function* () {
        const result = yield* getTorrents()
        const category = config.category?.trim().toLowerCase()
        const torrents = category
          ? result.torrents.filter((torrent) =>
              (torrent.labels ?? []).some((label) => label.toLowerCase() === category),
            )
          : result.torrents

        return torrents.map(
          (torrent): DownloadStatus => ({
            externalId: torrent.hashString,
            title: torrent.name,
            status: mapTransmissionStatus(torrent),
            sizeBytes: torrent.totalSize,
            progressFraction: progressFraction(torrent),
            etaSeconds: torrent.eta >= 0 ? torrent.eta : null,
            errorMessage: torrent.errorString?.trim() || null,
            outputPath: outputPath(torrent),
            downloadClientId: config.id,
          }),
        )
      }),

    removeDownload: (externalId, deleteFiles) =>
      rpcRequest<void>("torrent-remove", {
        ids: [externalId],
        "delete-local-data": deleteFiles,
      }),

    getHealth: () =>
      Effect.gen(function* () {
        const session = yield* getSession().pipe(
          Effect.map((value) => value),
          Effect.catchAll(() => Effect.succeed(null as TransmissionSessionArgs | null)),
        )
        return {
          connected: session !== null,
          version: session?.version ?? null,
          freeSpaceBytes: session?.["download-dir-free-space"] ?? null,
          errorMessage: session === null ? "failed to connect" : null,
        }
      }),
  }
}

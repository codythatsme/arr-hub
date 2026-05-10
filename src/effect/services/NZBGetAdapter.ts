import { Buffer } from "node:buffer"
import { randomUUID } from "node:crypto"

import { Effect } from "effect"

import type {
  AdapterMetadata,
  DownloadClientConfig,
  DownloadStatus,
  NormalizedDownloadStatus,
} from "../domain/downloadClient"
import { DownloadClientError, type DownloadClientErrorReason } from "../errors"
import type { DownloadClientAdapter } from "./DownloadClientAdapter"

export const nzbgetMetadata: AdapterMetadata = {
  displayName: "NZBGet",
  protocolAffinity: "usenet",
  defaultPort: 6789,
  authModel: "username/password",
}

interface NzbGetRpcResponse<T> {
  readonly result?: T
  readonly error?: { readonly message?: string; readonly code?: number } | null
}

interface NzbGetStatus {
  readonly DownloadPaused?: boolean
  readonly DownloadRate?: number
  readonly FreeDiskSpaceMB?: number
}

interface NzbGetConfigItem {
  readonly Name?: string
  readonly name?: string
  readonly Value?: string
  readonly value?: string
}

const SUCCESS_STATUS = new Set(["SUCCESS", "NONE", ""])
const DELETE_FAILED_STATUS = new Set(["HEALTH", "DUPE", "SCAN", "COPY", "BAD"])

function baseUrl(config: DownloadClientConfig): string {
  const scheme = config.useSsl ? "https" : "http"
  return `${scheme}://${config.host}:${config.port}/jsonrpc`
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

function numericField(record: Record<string, unknown>, ...keys: ReadonlyArray<string>): number {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return 0
}

function stringField(record: Record<string, unknown>, ...keys: ReadonlyArray<string>): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string") return value
    if (typeof value === "number") return String(value)
  }
  return ""
}

function parameters(record: Record<string, unknown>): ReadonlyArray<Record<string, unknown>> {
  const raw = record.Parameters ?? record.parameters
  return Array.isArray(raw) ? raw.filter((item) => typeof item === "object" && item !== null) : []
}

function droneParameter(record: Record<string, unknown>): string | null {
  for (const parameter of parameters(record)) {
    const name = stringField(parameter, "Name", "name")
    if (name !== "drone") continue
    const value = parameter.Value ?? parameter.value
    if (typeof value === "string" || typeof value === "number") return String(value)
  }
  return null
}

function makeInt64(high: number, low: number): number {
  return high * 2 ** 32 + low
}

function sizeFromParts(record: Record<string, unknown>, prefix: string): number {
  return makeInt64(
    numericField(record, `${prefix}Hi`, `${prefix}HI`),
    numericField(record, `${prefix}Lo`, `${prefix}LO`),
  )
}

function filenameFromUrl(downloadUrl: string): string {
  try {
    const url = new URL(downloadUrl)
    const pathname = url.pathname.replace(/\/+$/, "")
    const lastSegment = pathname.split("/").findLast((segment) => segment.length > 0)
    const decoded = lastSegment ? decodeURIComponent(lastSegment) : ""
    if (decoded.length > 0) return decoded.endsWith(".nzb") ? decoded : `${decoded}.nzb`
  } catch {
    // Fall through to a deterministic default for non-URL inputs.
  }
  return "download.nzb"
}

function configMap(items: ReadonlyArray<NzbGetConfigItem>): Map<string, string> {
  return new Map(
    items.flatMap((item) => {
      const name = item.Name ?? item.name
      const value = item.Value ?? item.value
      return name === undefined || value === undefined ? [] : [[name, value]]
    }),
  )
}

function categoryExists(config: Map<string, string>, category: string): boolean {
  for (let i = 1; i < 100; i++) {
    const name = config.get(`Category${i}.Name`)
    if (name === undefined) return false
    if (name.toLowerCase() === category.toLowerCase()) return true
  }
  return false
}

function parseSupportedVersion(version: string): boolean {
  const match = version.match(/^(\d+)(?:\.(\d+))?/)
  if (!match) return false
  const major = Number(match[1])
  const minor = Number(match[2] ?? "0")
  return major > 12 || (major === 12 && minor >= 0)
}

function freeSpaceBytes(status: NzbGetStatus): number | null {
  return typeof status.FreeDiskSpaceMB === "number"
    ? Math.round(status.FreeDiskSpaceMB * 1024 * 1024)
    : null
}

function queueStatus(
  item: Record<string, unknown>,
  status: NzbGetStatus,
): NormalizedDownloadStatus {
  const remaining = sizeFromParts(item, "RemainingSize")
  const paused = sizeFromParts(item, "PausedSize")
  const activeDownloads = numericField(item, "ActiveDownloads")

  if (status.DownloadPaused === true || (remaining === paused && remaining !== 0)) return "queued"
  if (activeDownloads === 0 && remaining !== 0) return "queued"
  return "downloading"
}

function historyStatus(item: Record<string, unknown>): NormalizedDownloadStatus | null {
  const markStatus = stringField(item, "MarkStatus")
  const deleteStatus = stringField(item, "DeleteStatus")

  if (deleteStatus === "MANUAL") return markStatus === "BAD" ? "failed" : null

  const parStatus = stringField(item, "ParStatus")
  const unpackStatus = stringField(item, "UnpackStatus")
  const moveStatus = stringField(item, "MoveStatus")
  const scriptStatus = stringField(item, "ScriptStatus")

  if (!SUCCESS_STATUS.has(parStatus)) return "failed"
  if (!SUCCESS_STATUS.has(unpackStatus)) return "failed"
  if (!SUCCESS_STATUS.has(moveStatus)) return "failed"
  if (!SUCCESS_STATUS.has(scriptStatus)) return "failed"
  if (!SUCCESS_STATUS.has(deleteStatus) && DELETE_FAILED_STATUS.has(deleteStatus)) return "failed"

  return "completed"
}

function historyMessage(item: Record<string, unknown>): string | null {
  const parts = [
    ["PAR", stringField(item, "ParStatus")],
    ["unpack", stringField(item, "UnpackStatus")],
    ["move", stringField(item, "MoveStatus")],
    ["script", stringField(item, "ScriptStatus")],
    ["delete", stringField(item, "DeleteStatus")],
    ["mark", stringField(item, "MarkStatus")],
  ].filter(([, value]) => value.length > 0)

  return parts.length === 0 ? null : parts.map(([name, value]) => `${name}: ${value}`).join(", ")
}

function sameCategory(itemCategory: string, category: string | null): boolean {
  return (
    category === null ||
    category.length === 0 ||
    itemCategory.toLowerCase() === category.toLowerCase()
  )
}

export function createNZBGetAdapter(config: DownloadClientConfig): DownloadClientAdapter {
  const url = baseUrl(config)
  const authHeader = basicAuthHeader(config)

  const rpcRequest = <T>(
    method: string,
    params: ReadonlyArray<unknown> = [],
  ): Effect.Effect<T, DownloadClientError> =>
    Effect.tryPromise({
      try: async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json-rpc, application/json",
              ...(authHeader ? { authorization: authHeader } : {}),
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method,
              params,
              id: randomUUID().slice(0, 8),
            }),
            signal: controller.signal,
          })

          if (response.status === 401 || response.status === 403) {
            throw Object.assign(new Error(`HTTP ${response.status}`), { authFailed: true })
          }
          if (!response.ok) throw new Error(`HTTP ${response.status}`)

          const payload = (await response.json()) as NzbGetRpcResponse<T>
          if (payload.error !== null && payload.error !== undefined) {
            throw Object.assign(new Error(payload.error.message ?? "NZBGet JSON-RPC error"), {
              invalidResponse: true,
            })
          }

          return payload.result as T
        } finally {
          clearTimeout(timeout)
        }
      },
      catch: (error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return makeError(config, "timeout", "request timed out after 15s", true)
        }
        if ((error as Record<string, unknown>).authFailed) {
          return makeError(config, "auth_failed", "invalid NZBGet credentials", false)
        }
        if ((error as Record<string, unknown>).invalidResponse) {
          return makeError(
            config,
            "invalid_response",
            error instanceof Error ? error.message : "invalid NZBGet response",
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

  const fetchNzb = (downloadUrl: string): Effect.Effect<Buffer, DownloadClientError> =>
    Effect.tryPromise({
      try: async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)
        try {
          const response = await fetch(downloadUrl, { signal: controller.signal })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return Buffer.from(await response.arrayBuffer())
        } finally {
          clearTimeout(timeout)
        }
      },
      catch: (error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return makeError(config, "timeout", "NZB fetch timed out after 15s", true)
        }
        return makeError(
          config,
          "download_rejected",
          `failed to fetch NZB: ${error instanceof Error ? error.message : "request failed"}`,
          true,
        )
      },
    })

  const getVersion = () => rpcRequest<string>("version")
  const getStatus = () => rpcRequest<NzbGetStatus>("status")
  const getConfig = () => rpcRequest<ReadonlyArray<NzbGetConfigItem>>("config")
  const getGroups = () => rpcRequest<ReadonlyArray<Record<string, unknown>>>("listgroups")
  const getHistory = () => rpcRequest<ReadonlyArray<Record<string, unknown>>>("history")
  const editQueue = (command: string, id: number) =>
    rpcRequest<boolean>("editqueue", [command, 0, "", id])

  return {
    testConnection: () =>
      Effect.gen(function* () {
        const version = yield* getVersion()
        if (!parseSupportedVersion(version)) {
          return yield* makeError(
            config,
            "invalid_response",
            `NZBGet ${version} is unsupported; version 12.0 or newer is required`,
            false,
          )
        }

        const [status, rawConfig] = yield* Effect.all([getStatus(), getConfig()])
        const parsedConfig = configMap(rawConfig)
        const keepHistory = Number(parsedConfig.get("KeepHistory") ?? "7")
        if (!Number.isInteger(keepHistory) || keepHistory <= 0 || keepHistory > 25_000) {
          return yield* makeError(
            config,
            "invalid_response",
            "NZBGet KeepHistory must be between 1 and 25000",
            false,
          )
        }

        const category = config.category?.trim()
        if (category && !categoryExists(parsedConfig, category)) {
          return yield* makeError(
            config,
            "category_create_failed",
            `NZBGet category "${category}" does not exist`,
            false,
          )
        }

        return {
          connected: true,
          version,
          freeSpaceBytes: freeSpaceBytes(status),
          errorMessage: null,
        }
      }),

    addDownload: (downloadUrl, options) =>
      Effect.gen(function* () {
        const nzb = yield* fetchNzb(downloadUrl)
        const category = options?.category ?? config.category ?? ""
        const droneId = randomUUID().replaceAll("-", "")
        const result = yield* rpcRequest<number>("append", [
          filenameFromUrl(downloadUrl),
          nzb.toString("base64"),
          category,
          0,
          false,
          options?.paused ?? false,
          "",
          0,
          "all",
          ["drone", droneId],
        ])

        if (typeof result !== "number" || result <= 0) {
          return yield* makeError(config, "download_rejected", "NZBGet rejected the NZB", false)
        }

        return droneId
      }),

    getQueue: () =>
      Effect.gen(function* () {
        const [status, groups, history] = yield* Effect.all([
          getStatus(),
          getGroups(),
          getHistory(),
        ])
        const category = config.category?.trim() || null
        let totalRemaining = 0

        const queueItems = groups.flatMap((item): ReadonlyArray<DownloadStatus> => {
          const itemCategory = stringField(item, "Category")
          if (!sameCategory(itemCategory, category)) return []

          const totalSize = sizeFromParts(item, "FileSize")
          const remaining = sizeFromParts(item, "RemainingSize")
          const paused = sizeFromParts(item, "PausedSize")
          const activeRemaining = Math.max(0, remaining - paused)
          const etaSeconds =
            typeof status.DownloadRate === "number" && status.DownloadRate > 0
              ? Math.round((totalRemaining + activeRemaining) / status.DownloadRate)
              : null
          totalRemaining += activeRemaining

          return [
            {
              externalId: droneParameter(item) ?? String(numericField(item, "NZBID", "NzbId")),
              title: stringField(item, "NZBName", "NzbName"),
              status: queueStatus(item, status),
              sizeBytes: totalSize,
              progressFraction:
                totalSize <= 0 ? 0 : Math.max(0, Math.min(1, (totalSize - remaining) / totalSize)),
              etaSeconds: etaSeconds === 0 ? null : etaSeconds,
              errorMessage: null,
              outputPath: null,
              downloadClientId: config.id,
            },
          ]
        })

        const historyItems = history.flatMap((item): ReadonlyArray<DownloadStatus> => {
          const itemCategory = stringField(item, "Category")
          if (!sameCategory(itemCategory, category)) return []
          const normalized = historyStatus(item)
          if (normalized === null) return []
          const outputPath = stringField(item, "FinalDir") || stringField(item, "DestDir") || null

          return [
            {
              externalId: droneParameter(item) ?? String(numericField(item, "ID", "Id")),
              title: stringField(item, "Name", "NZBName", "NzbName"),
              status: normalized,
              sizeBytes: sizeFromParts(item, "FileSize"),
              progressFraction: normalized === "completed" ? 1 : 0,
              etaSeconds: null,
              errorMessage: normalized === "failed" ? historyMessage(item) : null,
              outputPath,
              downloadClientId: config.id,
            },
          ]
        })

        return [...queueItems, ...historyItems]
      }),

    removeDownload: (externalId) =>
      Effect.gen(function* () {
        const [groups, history] = yield* Effect.all([getGroups(), getHistory()])
        const numericExternalId = Number(externalId)

        const queueItem = groups.find((item) => {
          const nzbId = numericField(item, "NZBID", "NzbId")
          if (Number.isInteger(numericExternalId) && externalId.length < 10) {
            return nzbId === numericExternalId
          }
          return droneParameter(item) === externalId
        })

        if (queueItem) {
          const result = yield* editQueue(
            "GroupFinalDelete",
            numericField(queueItem, "NZBID", "NzbId"),
          )
          if (result === false) {
            return yield* makeError(
              config,
              "invalid_response",
              "NZBGet refused queue removal",
              false,
            )
          }
          return
        }

        const historyItem = history.find((item) => {
          const id = numericField(item, "ID", "Id")
          if (Number.isInteger(numericExternalId) && externalId.length < 10) {
            return id === numericExternalId
          }
          return droneParameter(item) === externalId
        })

        if (historyItem) {
          const result = yield* editQueue("HistoryDelete", numericField(historyItem, "ID", "Id"))
          if (result === false) {
            return yield* makeError(
              config,
              "invalid_response",
              "NZBGet refused history removal",
              false,
            )
          }
        }
      }),

    getHealth: () =>
      Effect.gen(function* () {
        const [version, status] = yield* Effect.all([
          getVersion().pipe(Effect.catchAll(() => Effect.succeed(null as string | null))),
          getStatus().pipe(Effect.catchAll(() => Effect.succeed(null as NzbGetStatus | null))),
        ])

        return {
          connected: version !== null && status !== null,
          version,
          freeSpaceBytes: status ? freeSpaceBytes(status) : null,
          errorMessage: version === null || status === null ? "failed to connect" : null,
        }
      }),
  }
}

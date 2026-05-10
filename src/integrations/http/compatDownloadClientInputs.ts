import type { DownloadClientSettings, DownloadClientType } from "#/effect/domain/downloadClient"
import { ValidationError } from "#/effect/errors"

import { defaultDownloadClientSettings, defaultPortForType } from "./compatDownloadClientResources"

export interface CompatibleDownloadClientInput {
  readonly name: string
  readonly type: DownloadClientType
  readonly host: string
  readonly port: number
  readonly username: string
  readonly password: string
  readonly useSsl?: boolean
  readonly category?: string
  readonly enabled?: boolean
  readonly priority?: number
  readonly settings?: DownloadClientSettings
}

export interface CompatibleDownloadClientUpdate {
  readonly name?: string
  readonly type?: DownloadClientType
  readonly host?: string
  readonly port?: number
  readonly username?: string
  readonly password?: string
  readonly useSsl?: boolean
  readonly category?: string | null
  readonly enabled?: boolean
  readonly priority?: number
  readonly settings?: Partial<DownloadClientSettings>
}

interface CompatibleDownloadClientBody {
  readonly name?: unknown
  readonly type?: unknown
  readonly implementation?: unknown
  readonly implementationName?: unknown
  readonly protocol?: unknown
  readonly host?: unknown
  readonly port?: unknown
  readonly username?: unknown
  readonly password?: unknown
  readonly useSsl?: unknown
  readonly category?: unknown
  readonly enable?: unknown
  readonly enabled?: unknown
  readonly priority?: unknown
  readonly removeCompletedDownloads?: unknown
  readonly removeFailedDownloads?: unknown
  readonly fields?: unknown
}

interface CompatibleFieldBody {
  readonly name?: unknown
  readonly value?: unknown
}

const MASKED_SECRET = "********"

export function downloadClientCreateInputFromBody(
  body: unknown,
): CompatibleDownloadClientInput | ValidationError {
  const update = downloadClientUpdateInputFromBody(body)
  if (update instanceof ValidationError) return update
  if (update.name === undefined) return new ValidationError({ message: "name is required" })
  if (update.type === undefined) {
    return new ValidationError({ message: "implementation is required" })
  }
  if (update.host === undefined) return new ValidationError({ message: "host is required" })

  return {
    name: update.name,
    type: update.type,
    host: update.host,
    port: update.port ?? defaultPortForType(update.type),
    username: update.username ?? "",
    password: update.password ?? "",
    ...(update.useSsl === undefined ? {} : { useSsl: update.useSsl }),
    ...(update.category === undefined || update.category === null
      ? {}
      : { category: update.category }),
    ...(update.enabled === undefined ? {} : { enabled: update.enabled }),
    ...(update.priority === undefined ? {} : { priority: update.priority }),
    settings: { ...defaultDownloadClientSettings(), ...update.settings },
  }
}

export function downloadClientUpdateInputFromBody(
  body: unknown,
): CompatibleDownloadClientUpdate | ValidationError {
  if (!isObject(body)) return new ValidationError({ message: "download client body is required" })
  const resource = body as CompatibleDownloadClientBody
  const update: Record<string, unknown> = {}

  const name = optionalStringValue(resource.name)
  if (name !== undefined) {
    if (name === null) return new ValidationError({ message: "name must be a non-empty string" })
    update.name = name
  }

  const type = downloadClientTypeFromBody(resource)
  if (type instanceof ValidationError) return type
  if (type !== undefined) update.type = type

  const host =
    optionalStringValue(resource.host) ?? optionalStringValue(fieldValue(resource, ["host"]))
  if (host !== undefined) {
    if (host === null) return new ValidationError({ message: "host must be a non-empty string" })
    update.host = host
  }

  const port = optionalIntegerValue(resource.port ?? fieldValue(resource, ["port"]))
  if (port instanceof ValidationError) return port
  if (port !== undefined) {
    if (port === null || port < 1 || port > 65535) {
      return new ValidationError({ message: "port must be between 1 and 65535" })
    }
    update.port = port
  }

  const username =
    optionalStringValue(resource.username) ??
    optionalStringValue(fieldValue(resource, ["username"]))
  if (username !== undefined) update.username = username ?? ""

  const password =
    optionalStringValue(resource.password) ??
    optionalStringValue(fieldValue(resource, ["password"]))
  if (password !== undefined && password !== null && password !== MASKED_SECRET) {
    update.password = password
  }

  const useSsl =
    optionalBoolValue(resource.useSsl) ?? optionalBoolValue(fieldValue(resource, ["useSsl"]))
  if (useSsl !== undefined) update.useSsl = useSsl
  const enabled = optionalBoolValue(resource.enabled) ?? optionalBoolValue(resource.enable)
  if (enabled !== undefined) update.enabled = enabled

  const category =
    optionalStringValue(resource.category) ??
    optionalStringValue(fieldValue(resource, ["category"]))
  if (category !== undefined) update.category = category

  const priority = optionalIntegerValue(resource.priority)
  if (priority instanceof ValidationError) return priority
  if (priority !== undefined) {
    if (priority === null || priority < 1 || priority > 100) {
      return new ValidationError({ message: "priority must be between 1 and 100" })
    }
    update.priority = priority
  }

  const settings = settingsFromBody(resource)
  if (settings instanceof ValidationError) return settings
  if (Object.keys(settings).length > 0) update.settings = settings

  return update as CompatibleDownloadClientUpdate
}

function downloadClientTypeFromBody(
  resource: CompatibleDownloadClientBody,
): DownloadClientType | ValidationError | undefined {
  const explicit = optionalStringValue(resource.type)
  if (explicit !== undefined && explicit !== null) return explicit

  const implementation =
    optionalStringValue(resource.implementation) ?? optionalStringValue(resource.implementationName)
  if (implementation !== undefined && implementation !== null) {
    const normalized = implementation.toLowerCase().replaceAll(/[\s_-]/g, "")
    if (normalized === "deluge") return "deluge"
    if (normalized === "nzbget") return "nzbget"
    if (normalized === "qbittorrent") return "qbittorrent"
    if (normalized === "sabnzbd") return "sabnzbd"
    if (normalized === "transmission") return "transmission"
    if (normalized === "torrentblackhole") return "torrent_blackhole"
    if (normalized === "usenetblackhole") return "usenet_blackhole"
    return new ValidationError({ message: "unsupported download client implementation" })
  }

  const protocol = optionalStringValue(resource.protocol)
  if (protocol === "torrent") return "qbittorrent"
  if (protocol === "usenet") return "sabnzbd"
  if (protocol !== undefined && protocol !== null) {
    return new ValidationError({ message: "protocol must be torrent or usenet" })
  }
  return undefined
}

function settingsFromBody(
  resource: CompatibleDownloadClientBody,
): Partial<DownloadClientSettings> | ValidationError {
  const settings: Record<string, unknown> = {}

  for (const key of [
    "addPaused",
    "removeCompletedDownloads",
    "removeFailedDownloads",
    "saveMagnetFiles",
  ] as const) {
    const value = optionalBoolValue(fieldValue(resource, [key]))
    if (value !== undefined) settings[key] = value
  }

  for (const key of ["blackholeFolder", "watchFolder", "magnetFileExtension"] as const) {
    const value = optionalStringValue(fieldValue(resource, [key]))
    if (value !== undefined && value !== null) settings[key] = value
  }

  for (const key of ["pollIntervalMs", "watchGracePeriodSeconds"] as const) {
    const value = optionalIntegerValue(fieldValue(resource, [key]))
    if (value instanceof ValidationError) return value
    if (value !== undefined && value !== null) settings[key] = value
  }

  const removeCompleted =
    optionalBoolValue(resource.removeCompletedDownloads) ??
    optionalBoolValue(fieldValue(resource, ["removeCompletedDownloads"]))
  if (removeCompleted !== undefined) settings.removeCompletedDownloads = removeCompleted

  const removeFailed =
    optionalBoolValue(resource.removeFailedDownloads) ??
    optionalBoolValue(fieldValue(resource, ["removeFailedDownloads"]))
  if (removeFailed !== undefined) settings.removeFailedDownloads = removeFailed

  return settings
}

function fieldValue(resource: CompatibleDownloadClientBody, names: ReadonlyArray<string>): unknown {
  if (!Array.isArray(resource.fields)) return undefined
  const normalized = new Set(names.map((name) => name.toLowerCase()))
  for (const field of resource.fields) {
    if (!isObject(field)) continue
    const name = stringValue((field as CompatibleFieldBody).name)
    if (name !== null && normalized.has(name.toLowerCase())) {
      return (field as CompatibleFieldBody).value
    }
  }
  return undefined
}

function optionalIntegerValue(value: unknown): number | null | undefined | ValidationError {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  if (!Number.isInteger(parsed))
    return new ValidationError({ message: "numeric fields must be integers" })
  return parsed
}

function optionalBoolValue(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    if (value === "true" || value === "1") return true
    if (value === "false" || value === "0") return false
  }
  return undefined
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function optionalStringValue(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return stringValue(value)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

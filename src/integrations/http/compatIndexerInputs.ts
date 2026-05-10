import type { IndexerConfigValues, IndexerType } from "#/effect/domain/indexer"
import { ValidationError } from "#/effect/errors"

export interface CompatibleIndexerInput {
  readonly name: string
  readonly type: IndexerType
  readonly definitionKey?: string | null
  readonly baseUrl: string
  readonly apiKey: string
  readonly configValues?: IndexerConfigValues
  readonly enabled?: boolean
  readonly searchEnabled?: boolean
  readonly rssEnabled?: boolean
  readonly priority?: number
  readonly minimumSeeders?: number | null
  readonly queryCooldownSeconds?: number | null
  readonly queryLimitCount?: number | null
  readonly queryLimitWindowSeconds?: number | null
  readonly grabLimitCount?: number | null
  readonly grabLimitWindowSeconds?: number | null
  readonly categories?: ReadonlyArray<number>
}

export type CompatibleIndexerUpdate = Partial<CompatibleIndexerInput>

interface CompatibleIndexerBody {
  readonly name?: unknown
  readonly type?: unknown
  readonly implementation?: unknown
  readonly implementationName?: unknown
  readonly protocol?: unknown
  readonly definitionKey?: unknown
  readonly definitionName?: unknown
  readonly baseUrl?: unknown
  readonly apiKey?: unknown
  readonly enable?: unknown
  readonly enabled?: unknown
  readonly enableRss?: unknown
  readonly rssEnabled?: unknown
  readonly enableAutomaticSearch?: unknown
  readonly enableInteractiveSearch?: unknown
  readonly searchEnabled?: unknown
  readonly priority?: unknown
  readonly minimumSeeders?: unknown
  readonly queryCooldownSeconds?: unknown
  readonly queryLimitCount?: unknown
  readonly queryLimitWindowSeconds?: unknown
  readonly grabLimitCount?: unknown
  readonly grabLimitWindowSeconds?: unknown
  readonly categories?: unknown
  readonly fields?: unknown
}

interface CompatibleFieldBody {
  readonly name?: unknown
  readonly value?: unknown
}

const MASKED_SECRET = "********"
const FIELD_CONFIG_EXCLUSIONS = new Set([
  "apikey",
  "baseurl",
  "url",
  "categories",
  "minimumseeders",
  "definitionkey",
  "definitionfile",
])

export function indexerCreateInputFromBody(
  body: unknown,
): CompatibleIndexerInput | ValidationError {
  const update = indexerUpdateInputFromBody(body)
  if (update instanceof ValidationError) return update
  if (update.name === undefined) return new ValidationError({ message: "name is required" })
  if (update.type === undefined)
    return new ValidationError({ message: "implementation is required" })
  if (update.baseUrl === undefined) return new ValidationError({ message: "baseUrl is required" })
  if (update.apiKey === undefined) return new ValidationError({ message: "apiKey is required" })
  return update as CompatibleIndexerInput
}

export function indexerUpdateInputFromBody(
  body: unknown,
): CompatibleIndexerUpdate | ValidationError {
  if (!isObject(body)) return new ValidationError({ message: "indexer body is required" })
  const resource = body as CompatibleIndexerBody
  const update: Record<string, unknown> = {}

  const name = stringValue(resource.name)
  if (resource.name !== undefined) {
    if (name === null) return new ValidationError({ message: "name must be a non-empty string" })
    update.name = name
  }

  const type = indexerTypeFromBody(resource)
  if (type instanceof ValidationError) return type
  if (type !== undefined) update.type = type

  const definitionKey =
    optionalStringValue(resource.definitionKey) ??
    optionalStringValue(resource.definitionName) ??
    optionalStringValue(fieldValue(resource, ["definitionKey", "definitionFile"]))
  if (definitionKey !== undefined) update.definitionKey = definitionKey

  const baseUrl =
    optionalStringValue(resource.baseUrl) ??
    optionalStringValue(fieldValue(resource, ["baseUrl", "url"]))
  if (baseUrl !== undefined) {
    if (baseUrl === null)
      return new ValidationError({ message: "baseUrl must be a non-empty string" })
    if (!isUrl(baseUrl)) return new ValidationError({ message: "baseUrl must be a URL" })
    update.baseUrl = baseUrl
  }

  const apiKey =
    optionalStringValue(resource.apiKey) ??
    optionalStringValue(fieldValue(resource, ["apiKey", "apikey"]))
  if (apiKey !== undefined && apiKey !== null && apiKey !== MASKED_SECRET) {
    update.apiKey = apiKey
  }

  const enabled = optionalBoolValue(resource.enabled) ?? optionalBoolValue(resource.enable)
  if (enabled !== undefined) update.enabled = enabled
  const rssEnabled = optionalBoolValue(resource.rssEnabled) ?? optionalBoolValue(resource.enableRss)
  if (rssEnabled !== undefined) update.rssEnabled = rssEnabled
  const searchEnabled =
    optionalBoolValue(resource.searchEnabled) ??
    optionalBoolValue(resource.enableAutomaticSearch) ??
    optionalBoolValue(resource.enableInteractiveSearch)
  if (searchEnabled !== undefined) update.searchEnabled = searchEnabled

  for (const key of [
    "priority",
    "minimumSeeders",
    "queryCooldownSeconds",
    "queryLimitCount",
    "queryLimitWindowSeconds",
    "grabLimitCount",
    "grabLimitWindowSeconds",
  ] as const) {
    const value = optionalIntegerValue(resource[key] ?? fieldValue(resource, [key]))
    if (value instanceof ValidationError) return value
    if (value !== undefined) update[key] = value
  }

  if (update.priority !== undefined) {
    const priority = update.priority as number
    if (priority < 1 || priority > 100) {
      return new ValidationError({ message: "priority must be between 1 and 100" })
    }
  }

  const categories = categoriesValue(resource.categories ?? fieldValue(resource, ["categories"]))
  if (categories instanceof ValidationError) return categories
  if (categories !== undefined) update.categories = categories

  const configValues = configValuesFromFields(resource)
  if (Object.keys(configValues).length > 0) update.configValues = configValues

  return update as CompatibleIndexerUpdate
}

function indexerTypeFromBody(
  resource: CompatibleIndexerBody,
): IndexerType | ValidationError | undefined {
  const explicit = optionalStringValue(resource.type)
  if (explicit !== undefined && explicit !== null) return explicit

  const implementation =
    optionalStringValue(resource.implementation) ?? optionalStringValue(resource.implementationName)
  if (implementation !== undefined && implementation !== null) {
    const normalized = implementation.toLowerCase()
    if (normalized === "torznab") return "torznab"
    if (normalized === "newznab") return "newznab"
    if (normalized === "cardigann" || normalized === "cardigann_yaml") return "cardigann_yaml"
    return new ValidationError({ message: "unsupported indexer implementation" })
  }

  const protocol = optionalStringValue(resource.protocol)
  if (protocol === "torrent") return "torznab"
  if (protocol === "usenet") return "newznab"
  if (protocol !== undefined && protocol !== null) {
    return new ValidationError({ message: "protocol must be torrent or usenet" })
  }
  return undefined
}

function configValuesFromFields(resource: CompatibleIndexerBody): Record<string, string> {
  if (!Array.isArray(resource.fields)) return {}
  const values: Record<string, string> = {}
  for (const field of resource.fields) {
    if (!isObject(field)) continue
    const name = stringValue((field as CompatibleFieldBody).name)
    if (name === null || FIELD_CONFIG_EXCLUSIONS.has(name.toLowerCase())) continue
    const value = (field as CompatibleFieldBody).value
    if (typeof value === "string") values[name] = value
    else if (typeof value === "number" || typeof value === "boolean") values[name] = String(value)
  }
  return values
}

function fieldValue(resource: CompatibleIndexerBody, names: ReadonlyArray<string>): unknown {
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

function categoriesValue(value: unknown): ReadonlyArray<number> | ValidationError | undefined {
  if (value === undefined) return undefined
  if (Array.isArray(value)) {
    const categories = value.map((item) => integerValue(item))
    if (categories.some((item) => item === null || item < 0)) {
      return new ValidationError({ message: "categories must be non-negative integers" })
    }
    return categories as ReadonlyArray<number>
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.length === 0) return []
    const categories = trimmed.split(",").map((item) => integerValue(item))
    if (categories.some((item) => item === null || item < 0)) {
      return new ValidationError({ message: "categories must be non-negative integers" })
    }
    return categories as ReadonlyArray<number>
  }
  return new ValidationError({ message: "categories must be an array or comma-separated string" })
}

function optionalIntegerValue(value: unknown): number | null | undefined | ValidationError {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  const parsed = integerValue(value)
  if (parsed === null) return new ValidationError({ message: "numeric fields must be integers" })
  return parsed
}

function integerValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isInteger(parsed) ? parsed : null
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

function isUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

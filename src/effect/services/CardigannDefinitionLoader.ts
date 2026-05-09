import { load } from "js-yaml"

import type {
  IndexerAuthField,
  IndexerAuthFieldType,
  IndexerCategoryMapping,
  IndexerDefinitionSeed,
  IndexerPrivacy,
  IndexerProtocol,
} from "../domain/indexer"

const PUBLIC_DOMAIN_MOVIE_TORRENTS = `
id: public-domain-movie-torrents
name: Public Domain Movie Torrents
description: Public-domain movie releases exposed through a Cardigann-style definition.
type: public
links:
  - https://publicdomainmovie.example
version: builtin-cardigann-1
tags:
  - public
  - movies
settings:
  - name: apiKey
    label: API key
    type: password
    required: false
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    search: [q]
    movie-search: [q, imdbid]
`

const OPEN_TV_TORRENTS = `
id: open-tv-torrents
name: Open TV Torrents
description: Public TV releases exposed through a Cardigann-style definition.
type: public
links:
  - https://opentv.example
version: builtin-cardigann-1
tags:
  - public
  - tv
settings:
  - name: cookie
    label: Cookie
    type: cookie
    required: false
caps:
  categorymappings:
    - id: tv
      cat: TV
      desc: TV
    - id: tv-hd
      cat: TV/HD
      desc: TV HD
  modes:
    search: [q]
    tv-search: [q, season, ep, imdbid]
`

const CATEGORY_NAME_TO_NEWZNAB: Readonly<Record<string, number>> = {
  anime: 5070,
  audio: 3000,
  book: 7020,
  books: 7000,
  console: 1000,
  games: 1000,
  movies: 2000,
  music: 3000,
  pc: 4000,
  tv: 5000,
  "tv/hd": 5040,
  "tv/sd": 5030,
  xxx: 6000,
}

export const BUILT_IN_CARDIGANN_DEFINITIONS: ReadonlyArray<IndexerDefinitionSeed> = [
  parseCardigannDefinitionYaml(PUBLIC_DOMAIN_MOVIE_TORRENTS),
  parseCardigannDefinitionYaml(OPEN_TV_TORRENTS),
]

export function parseCardigannDefinitionYaml(source: string): IndexerDefinitionSeed {
  const root = expectRecord(load(source), "definition")
  const definitionKey = requiredString(root, "id")
  const displayName = requiredString(root, "name")
  const protocol = parseProtocol(optionalString(root, "protocol") ?? "torrent")
  const privacy = parsePrivacy(
    optionalString(root, "privacy") ?? optionalString(root, "type") ?? "private",
  )
  const caps = expectRecord(root.caps ?? {}, "caps")
  const categories = parseCategories(root.categories ?? caps.categorymappings)
  const searchTypes = parseSearchTypes(caps)

  return {
    definitionKey,
    displayName,
    protocol,
    implementation: "cardigann_yaml",
    baseUrl: optionalString(root, "baseUrl") ?? firstString(root.links),
    privacy,
    supportsRss: optionalBoolean(root, "rss") ?? true,
    supportsSearch: searchTypes.length > 0,
    authFields: parseAuthFields(root.auth ?? root.settings),
    categories,
    capabilities: {
      searchTypes,
      categories: categories.map((category) => ({
        id: category.newznabCategory,
        name: category.trackerCategoryDesc,
      })),
    },
    tags: parseStringArray(root.tags),
    version: optionalString(root, "version") ?? "cardigann-yaml",
  }
}

function parseSearchTypes(value: unknown): ReadonlyArray<string> {
  const caps = expectRecord(value, "caps")
  const modes = isRecord(caps.modes) ? caps.modes : {}
  const types: Array<string> = []
  if (truthy(caps.search) || "search" in modes) types.push("search")
  if (truthy(caps.movie) || "movie-search" in modes || "movie" in modes) types.push("movie")
  if (truthy(caps.tv) || "tv-search" in modes || "tvsearch" in modes || "tv" in modes) {
    types.push("tvsearch")
  }
  return types
}

function parseAuthFields(value: unknown): ReadonlyArray<IndexerAuthField> {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error("auth must be a list")
  return value.map((item) => {
    const field = expectRecord(item, "auth field")
    return {
      name: requiredString(field, "name"),
      label: optionalString(field, "label") ?? requiredString(field, "name"),
      type: parseAuthFieldType(optionalString(field, "type") ?? "text"),
      required: optionalBoolean(field, "required") ?? false,
      helpText: optionalString(field, "helpText") ?? undefined,
    }
  })
}

function parseCategories(value: unknown): ReadonlyArray<IndexerCategoryMapping> {
  if (!Array.isArray(value)) throw new Error("categories must be a list")
  return value.map((item) => {
    const category = expectRecord(item, "category")
    const trackerCategory = requiredStringFromAny(category, ["tracker", "id"])
    return {
      trackerCategory,
      trackerCategoryDesc:
        optionalString(category, "description") ??
        optionalString(category, "desc") ??
        trackerCategory,
      newznabCategory: resolveNewznabCategory(category),
    }
  })
}

function resolveNewznabCategory(record: Record<string, unknown>): number {
  const explicit = record.newznab ?? record.newznabCategory
  if (explicit !== undefined) return positiveIntFromValue(explicit, "newznab")

  const category = record.cat
  const resolved = Array.isArray(category)
    ? category.map(newznabFromCategoryName).find((item) => item !== null)
    : newznabFromCategoryName(category)
  if (resolved !== null && resolved !== undefined) return resolved

  throw new Error("category must include a known cat or newznab category")
}

function newznabFromCategoryName(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value !== "string") return null

  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  return CATEGORY_NAME_TO_NEWZNAB[trimmed.toLowerCase()] ?? null
}

function parseStringArray(value: unknown): ReadonlyArray<string> {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error("tags must be a list")
  return value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error("tags must contain non-empty strings")
    }
    return item.trim()
  })
}

function parseProtocol(value: string): IndexerProtocol {
  if (value === "torrent" || value === "usenet") return value
  throw new Error(`unsupported indexer protocol: ${value}`)
}

function parsePrivacy(value: string): IndexerPrivacy {
  if (value === "public" || value === "private" || value === "semi_private") return value
  if (value === "semi-private") return "semi_private"
  throw new Error(`unsupported indexer privacy: ${value}`)
}

function parseAuthFieldType(value: string): IndexerAuthFieldType {
  if (value === "input") return "text"
  if (value === "text" || value === "password" || value === "cookie" || value === "textarea") {
    return value
  }
  throw new Error(`unsupported auth field type: ${value}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required`)
  }
  return value.trim()
}

function requiredStringFromAny(
  record: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): string {
  for (const key of keys) {
    const value = optionalStringLike(record, key)
    if (value !== null) return value
  }
  throw new Error(`${keys.join(" or ")} is required`)
}

function optionalStringLike(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return optionalString(record, key)
}

function optionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (value === undefined || value === null) return null
  if (typeof value !== "string") throw new Error(`${key} must be a string`)
  return value.trim().length > 0 ? value.trim() : null
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key]
  if (value === undefined || value === null) return null
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`)
  return value
}

function positiveIntFromValue(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim())
  throw new Error(`${label} must be a positive integer`)
}

function firstString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) throw new Error("links must be a list")
  const first = value.find((item) => typeof item === "string" && item.trim().length > 0)
  return typeof first === "string" ? first.trim() : null
}

function truthy(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "object" && value !== null && "available" in value) {
    return Boolean((value as { readonly available?: unknown }).available)
  }
  return false
}

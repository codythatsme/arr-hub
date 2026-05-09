import { load } from "js-yaml"

import type {
  IndexerAuthField,
  IndexerAuthFieldOption,
  IndexerAuthFieldType,
  IndexerCategoryMapping,
  IndexerCapabilities,
  IndexerDefinitionSeed,
  IndexerPrivacy,
  IndexerProtocol,
} from "../domain/indexer"

export type CardigannResponseType = "torznab" | "newznab" | "rss"

export interface CardigannSearchPath {
  readonly path: string
  readonly method: "get" | "post"
  readonly inputs: Readonly<Record<string, string>>
  readonly headers: Readonly<Record<string, string>>
  readonly categories: ReadonlyArray<string>
  readonly responseType: CardigannResponseType
}

export interface CardigannSearchRuntime {
  readonly allowEmptyInputs: boolean
  readonly inputs: Readonly<Record<string, string>>
  readonly headers: Readonly<Record<string, string>>
  readonly paths: ReadonlyArray<CardigannSearchPath>
}

export interface CardigannRuntimeDefinition {
  readonly definitionKey: string
  readonly displayName: string
  readonly protocol: IndexerProtocol
  readonly baseUrl: string | null
  readonly categories: ReadonlyArray<IndexerCategoryMapping>
  readonly capabilities: IndexerCapabilities
  readonly search: CardigannSearchRuntime
}

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
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        apikey: "{{ .Config.APIKey }}"
        t: "{{ .Query.Type }}"
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
        imdbid: "{{ .Query.IMDBID }}"
        tmdbid: "{{ .Query.TMDBID }}"
        limit: "{{ .Query.Limit }}"
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
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        apikey: "{{ .Config.APIKey }}"
        t: "{{ .Query.Type }}"
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
        imdbid: "{{ .Query.IMDBID }}"
        tvdbid: "{{ .Query.TVDBID }}"
        season: "{{ .Query.Season }}"
        ep: "{{ .Query.Ep }}"
        limit: "{{ .Query.Limit }}"
`

const NYAA = `
id: nyaa
name: Nyaa
description: Public anime BitTorrent releases exposed through the Nyaa RSS feed.
type: public
links:
  - https://nyaa.si/
version: builtin-cardigann-1
tags:
  - public
  - anime
  - rss
caps:
  categorymappings:
    - id: 1_2
      cat: anime
      desc: Anime English-translated
      newznab: 5070
    - id: 1_4
      cat: anime
      desc: Anime Raw
      newznab: 5070
  modes:
    search: [q]
    tv-search: [q, season, ep]
search:
  paths:
    - path: /
      response:
        type: rss
      inputs:
        page: rss
        q: "{{ .Keywords }}"
        f: "0"
        c: "0_0"
`

const ANIME_TOSHO = `
id: animetosho
name: AnimeTosho
description: Public anime Torznab-compatible feed mirrored through a Cardigann-style definition.
type: public
links:
  - https://feed.animetosho.org
version: builtin-cardigann-1
tags:
  - public
  - anime
  - torznab
caps:
  categorymappings:
    - id: anime
      cat: anime
      desc: Anime
      newznab: 5070
    - id: anime-movie
      cat: movies
      desc: Anime Movies
      newznab: 2020
  modes:
    search: [q]
    movie-search: [q]
    tv-search: [q, season, ep]
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        t: "{{ .Query.Type }}"
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
        season: "{{ .Query.Season }}"
        ep: "{{ .Query.Ep }}"
        limit: "{{ .Query.Limit }}"
`

const MORE_THAN_TV = `
id: morethantv
name: MoreThanTV
description: Private TV and movie tracker exposed through a Torznab-compatible endpoint.
type: private
links:
  - https://www.morethantv.me
version: builtin-cardigann-1
tags:
  - private
  - movies
  - tv
  - torznab
settings:
  - name: apiKey
    label: API key
    type: password
    required: true
    helpText: MoreThanTV Torznab API key.
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
    - id: tv
      cat: TV
      desc: TV
      newznab: 5000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid, tvdbid]
search:
  paths:
    - path: /api/torznab
      response:
        type: torznab
      inputs:
        apikey: "{{ .Config.APIKey }}"
        t: "{{ .Query.Type }}"
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
        imdbid: "{{ .Query.IMDBID }}"
        tvdbid: "{{ .Query.TVDBID }}"
        season: "{{ .Query.Season }}"
        ep: "{{ .Query.Ep }}"
        limit: "{{ .Query.Limit }}"
`

const TORRENT_NETWORK = `
id: torrent-network
name: Torrent Network
description: German private TV, movie, and general tracker exposed through a Torznab-compatible endpoint.
type: private
links:
  - https://tntracker.org
version: builtin-cardigann-1
tags:
  - private
  - movies
  - tv
  - general
  - de
  - torznab
settings:
  - name: apiKey
    label: API key
    type: password
    required: true
    helpText: Torrent Network Torznab API key.
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
    - id: tv
      cat: TV
      desc: TV
      newznab: 5000
    - id: general
      cat: Other
      desc: General
      newznab: 8000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid, tvdbid]
search:
  paths:
    - path: /api/torznab/api
      response:
        type: torznab
      inputs:
        apikey: "{{ .Config.APIKey }}"
        t: "{{ .Query.Type }}"
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
        imdbid: "{{ .Query.IMDBID }}"
        tvdbid: "{{ .Query.TVDBID }}"
        season: "{{ .Query.Season }}"
        ep: "{{ .Query.Ep }}"
        limit: "{{ .Query.Limit }}"
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
  other: 8000,
  xxx: 6000,
}

const BUILT_IN_CARDIGANN_SOURCES = [
  PUBLIC_DOMAIN_MOVIE_TORRENTS,
  OPEN_TV_TORRENTS,
  NYAA,
  ANIME_TOSHO,
  MORE_THAN_TV,
  TORRENT_NETWORK,
] as const

export const BUILT_IN_CARDIGANN_DEFINITIONS: ReadonlyArray<IndexerDefinitionSeed> =
  BUILT_IN_CARDIGANN_SOURCES.map(parseCardigannDefinitionYaml)

export const BUILT_IN_CARDIGANN_RUNTIME_DEFINITIONS: ReadonlyArray<CardigannRuntimeDefinition> =
  BUILT_IN_CARDIGANN_SOURCES.map(parseCardigannRuntimeDefinitionYaml)

export function getBuiltInCardigannRuntimeDefinition(
  definitionKey: string | null | undefined,
): CardigannRuntimeDefinition | null {
  if (!definitionKey) return null
  return (
    BUILT_IN_CARDIGANN_RUNTIME_DEFINITIONS.find(
      (definition) => definition.definitionKey === definitionKey,
    ) ?? null
  )
}

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

export function parseCardigannRuntimeDefinitionYaml(source: string): CardigannRuntimeDefinition {
  const root = expectRecord(load(source), "definition")
  const seed = parseCardigannDefinitionYaml(source)
  return {
    definitionKey: seed.definitionKey,
    displayName: seed.displayName,
    protocol: seed.protocol,
    baseUrl: seed.baseUrl,
    categories: seed.categories,
    capabilities: seed.capabilities,
    search: parseSearchRuntime(root, seed.protocol),
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

function parseSearchRuntime(
  root: Record<string, unknown>,
  protocol: IndexerProtocol,
): CardigannSearchRuntime {
  const search = expectRecord(root.search ?? {}, "search")
  const paths = parseSearchPaths(search.paths ?? search.path, protocol)
  return {
    allowEmptyInputs: optionalBoolean(search, "allowEmptyInputs") ?? false,
    inputs: parseInputMap(search.inputs),
    headers: parseInputMap(search.headers),
    paths,
  }
}

function parseSearchPaths(
  value: unknown,
  protocol: IndexerProtocol,
): ReadonlyArray<CardigannSearchPath> {
  const fallbackResponseType: CardigannResponseType = protocol === "usenet" ? "newznab" : "torznab"
  const pathValues =
    typeof value === "string"
      ? [{ path: value }]
      : Array.isArray(value)
        ? value
        : isRecord(value)
          ? [value]
          : []

  return pathValues.map((item) => {
    const path = typeof item === "string" ? { path: item } : expectRecord(item, "search path")
    const response = isRecord(path.response) ? path.response : {}
    return {
      path: requiredString(path, "path"),
      method: parseMethod(optionalString(path, "method") ?? "get"),
      inputs: parseInputMap(path.inputs),
      headers: parseInputMap(path.headers),
      categories: parseOptionalStringArray(path.categories),
      responseType: parseResponseType(optionalString(response, "type") ?? fallbackResponseType),
    }
  })
}

function parseInputMap(value: unknown): Readonly<Record<string, string>> {
  if (value === undefined) return {}
  const record = expectRecord(value, "inputs")
  const inputs: Record<string, string> = {}
  for (const [key, val] of Object.entries(record)) {
    inputs[key] = inputScalarToString(val, `input ${key}`)
  }
  return inputs
}

function inputScalarToString(value: unknown, label: string): string {
  if (typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  throw new Error(`${label} must be a scalar value`)
}

function parseAuthFields(value: unknown): ReadonlyArray<IndexerAuthField> {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error("auth must be a list")
  return value.map((item) => {
    const field = expectRecord(item, "auth field")
    const defaultValue = optionalScalarStringFromAny(field, ["default", "defaultValue"])
    const helpText = optionalString(field, "helpText")
    const options = parseAuthFieldOptions(field.options)
    return {
      name: requiredString(field, "name"),
      label: optionalString(field, "label") ?? requiredString(field, "name"),
      type: parseAuthFieldType(optionalString(field, "type") ?? "text"),
      required: optionalBoolean(field, "required") ?? false,
      ...(helpText !== null ? { helpText } : {}),
      ...(defaultValue !== null ? { defaultValue } : {}),
      ...(options.length > 0 ? { options } : {}),
    }
  })
}

function parseAuthFieldOptions(value: unknown): ReadonlyArray<IndexerAuthFieldOption> {
  if (value === undefined) return []

  if (isRecord(value)) {
    return Object.entries(value).map(([key, optionValue]) => {
      const label = inputScalarToString(optionValue, `auth field option ${key}`).trim()
      return {
        value: key,
        label: label.length > 0 ? label : key,
      }
    })
  }

  if (!Array.isArray(value)) throw new Error("auth field options must be a list or object")
  return value.map((item) => {
    if (!isRecord(item)) {
      const optionValue = inputScalarToString(item, "auth field option").trim()
      if (optionValue.length === 0) throw new Error("auth field option value is required")
      return { value: optionValue, label: optionValue }
    }

    const optionValue = optionalScalarStringFromAny(item, ["value", "id", "key"])
    if (optionValue === null) throw new Error("auth field option value is required")
    return {
      value: optionValue,
      label: optionalScalarStringFromAny(item, ["label", "name", "text"]) ?? optionValue,
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

function parseOptionalStringArray(value: unknown): ReadonlyArray<string> {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error("categories must be a list")
  return value.map((item) => {
    const normalized = typeof item === "number" && Number.isFinite(item) ? String(item) : item
    if (typeof normalized !== "string" || normalized.trim().length === 0) {
      throw new Error("categories must contain non-empty strings")
    }
    return normalized.trim()
  })
}

function parseProtocol(value: string): IndexerProtocol {
  if (value === "torrent" || value === "usenet") return value
  throw new Error(`unsupported indexer protocol: ${value}`)
}

function parseMethod(value: string): "get" | "post" {
  const method = value.toLowerCase()
  if (method === "get" || method === "post") return method
  throw new Error(`unsupported Cardigann search method: ${value}`)
}

function parseResponseType(value: string): CardigannResponseType {
  const type = value.toLowerCase()
  if (type === "torznab" || type === "newznab" || type === "rss") return type
  if (type === "xml") return "torznab"
  throw new Error(`unsupported Cardigann response type: ${value}`)
}

function parsePrivacy(value: string): IndexerPrivacy {
  if (value === "public" || value === "private" || value === "semi_private") return value
  if (value === "semi-private") return "semi_private"
  throw new Error(`unsupported indexer privacy: ${value}`)
}

function parseAuthFieldType(value: string): IndexerAuthFieldType {
  const type = value.toLowerCase()
  if (type === "input") return "text"
  if (
    type === "text" ||
    type === "password" ||
    type === "cookie" ||
    type === "textarea" ||
    type === "select"
  ) {
    return type
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

function optionalScalarStringFromAny(
  record: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): string | null {
  for (const key of keys) {
    const value = record[key]
    if (value === undefined || value === null) continue
    const text = inputScalarToString(value, key).trim()
    if (text.length > 0) return text
  }
  return null
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

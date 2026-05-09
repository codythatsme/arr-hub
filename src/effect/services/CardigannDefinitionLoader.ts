import { load } from "js-yaml"

import { CATEGORIES } from "../domain/categories"
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

export type CardigannResponseType = "html" | "json" | "torznab" | "newznab" | "rss"

export interface CardigannSearchPath {
  readonly path: string
  readonly method: "get" | "post"
  readonly inheritInputs: boolean
  readonly inputs: Readonly<Record<string, string>>
  readonly headers: Readonly<Record<string, string>>
  readonly categories: ReadonlyArray<string>
  readonly responseType: CardigannResponseType
}

export interface CardigannLoginPath {
  readonly path: string
  readonly method: "get" | "post"
  readonly inputs: Readonly<Record<string, string>>
  readonly headers: Readonly<Record<string, string>>
}

export interface CardigannLoginError {
  readonly selector?: string
  readonly message?: CardigannFieldSelector
}

export interface CardigannLoginTest {
  readonly path?: string
  readonly selector: string
}

export interface CardigannLoginCaptcha {
  readonly type?: string
  readonly selector?: string
  readonly input?: string
}

export interface CardigannFilter {
  readonly name: string
  readonly args: ReadonlyArray<string>
}

export interface CardigannRowsSelector {
  readonly selector: string
  readonly after?: number
  readonly filters: ReadonlyArray<CardigannFilter>
  readonly dateHeaders?: CardigannFieldSelector
}

export interface CardigannFieldSelector {
  readonly selector?: string
  readonly attribute?: string
  readonly text?: string
  readonly remove?: string
  readonly case?: Readonly<Record<string, string>>
  readonly defaultValue?: string
  readonly optional: boolean
  readonly filters: ReadonlyArray<CardigannFilter>
}

export interface CardigannSearchRuntime {
  readonly allowEmptyInputs: boolean
  readonly keywordFilters: ReadonlyArray<CardigannFilter>
  readonly preprocessingFilters: ReadonlyArray<CardigannFilter>
  readonly inputs: Readonly<Record<string, string>>
  readonly headers: Readonly<Record<string, string>>
  readonly rows: CardigannRowsSelector | null
  readonly fields: Readonly<Record<string, CardigannFieldSelector>>
  readonly paths: ReadonlyArray<CardigannSearchPath>
}

export interface CardigannLoginRuntime {
  readonly method: "get" | "post" | "cookie" | "oneurl" | "form"
  readonly inputs: Readonly<Record<string, string>>
  readonly headers: Readonly<Record<string, string>>
  readonly cookies: ReadonlyArray<string>
  readonly errors: ReadonlyArray<CardigannLoginError>
  readonly paths: ReadonlyArray<CardigannLoginPath>
  readonly selectors?: boolean
  readonly selectorInputs?: Readonly<Record<string, CardigannFieldSelector>>
  readonly getSelectorInputs?: Readonly<Record<string, CardigannFieldSelector>>
  readonly test?: CardigannLoginTest
  readonly captcha?: CardigannLoginCaptcha
  readonly form?: string
  readonly submitPath?: string
}

export interface CardigannRuntimeDefinition {
  readonly definitionKey: string
  readonly displayName: string
  readonly protocol: IndexerProtocol
  readonly baseUrl: string | null
  readonly authFields: ReadonlyArray<IndexerAuthField>
  readonly categories: ReadonlyArray<IndexerCategoryMapping>
  readonly capabilities: IndexerCapabilities
  readonly login: CardigannLoginRuntime | null
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

const CATEGORY_NAME_ALIASES: Readonly<Record<string, number>> = {
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

const CATEGORY_NAME_TO_NEWZNAB: ReadonlyMap<string, number> = new Map([
  ...CATEGORIES.map((category) => [normalizeCategoryName(category.name), category.id] as const),
  ...Object.entries(CATEGORY_NAME_ALIASES).map(
    ([name, category]) => [normalizeCategoryName(name), category] as const,
  ),
])

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
  const categories = parseCategories(root.categories ?? caps.categorymappings ?? caps.categories)
  const searchTypes = parseSearchTypes(caps)
  const authFields = appendCaptchaAuthField(parseAuthFields(root.auth ?? root.settings), root.login)

  return {
    definitionKey,
    displayName,
    protocol,
    implementation: "cardigann_yaml",
    baseUrl: optionalString(root, "baseUrl") ?? firstString(root.links),
    privacy,
    supportsRss: optionalBoolean(root, "rss") ?? true,
    supportsSearch: searchTypes.length > 0,
    authFields,
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
    authFields: seed.authFields,
    categories: seed.categories,
    capabilities: seed.capabilities,
    login: parseLoginRuntime(root.login),
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
    keywordFilters: parseFilters(search.keywordsfilters ?? search.keywordsFilters),
    preprocessingFilters: parseFilters(search.preprocessingfilters ?? search.preprocessingFilters),
    inputs: parseInputMap(search.inputs),
    headers: parseHeaderMap(search.headers),
    rows: parseRows(search.rows),
    fields: parseFields(search.fields),
    paths,
  }
}

function parseLoginRuntime(value: unknown): CardigannLoginRuntime | null {
  if (value === undefined) return null
  const login = expectRecord(value, "login")
  const method = parseLoginMethod(optionalString(login, "method") ?? "get")
  const form = optionalString(login, "form")
  const submitPath = optionalString(login, "submitpath") ?? optionalString(login, "submitPath")
  const selectors = optionalBoolean(login, "selectors") === true
  const selectorInputs = parseSelectorInputMap(
    login.selectorinputs ?? login.selectorInputs,
    "login selector inputs",
  )
  const getSelectorInputs = parseSelectorInputMap(
    login.getselectorinputs ?? login.getSelectorInputs,
    "login get selector inputs",
  )
  const test = parseLoginTest(login.test)
  const captcha = parseLoginCaptcha(login.captcha)
  return {
    method,
    inputs: parseInputMap(login.inputs),
    headers: parseHeaderMap(login.headers),
    cookies: parseScalarStringArray(login.cookies, "login cookies"),
    errors: parseLoginErrors(login.error),
    paths:
      method === "cookie"
        ? []
        : parseLoginPaths(
            login.paths ?? login.path,
            login,
            method === "oneurl" || method === "form" ? "get" : null,
          ),
    ...(selectors ? { selectors } : {}),
    ...(Object.keys(selectorInputs).length > 0 ? { selectorInputs } : {}),
    ...(Object.keys(getSelectorInputs).length > 0 ? { getSelectorInputs } : {}),
    ...(test !== undefined ? { test } : {}),
    ...(captcha !== undefined ? { captcha } : {}),
    ...(form !== null ? { form } : {}),
    ...(submitPath !== null ? { submitPath } : {}),
  }
}

function parseLoginPaths(
  value: unknown,
  login: Record<string, unknown>,
  defaultMethodOverride: "get" | "post" | null = null,
): ReadonlyArray<CardigannLoginPath> {
  const pathValues =
    typeof value === "string"
      ? [{ path: value }]
      : Array.isArray(value)
        ? value
        : isRecord(value)
          ? [value]
          : []
  const defaultMethod = defaultMethodOverride ?? optionalString(login, "method") ?? "get"

  return pathValues.map((item) => {
    const path = typeof item === "string" ? { path: item } : expectRecord(item, "login path")
    return {
      path: requiredString(path, "path"),
      method: defaultMethodOverride ?? parseMethod(optionalString(path, "method") ?? defaultMethod),
      inputs: parseInputMap(path.inputs),
      headers: parseHeaderMap(path.headers),
    }
  })
}

function parseRows(value: unknown): CardigannRowsSelector | null {
  if (value === undefined) return null
  const rows = expectRecord(value, "rows")
  const after = optionalNonNegativeInt(rows, "after")
  const dateHeaders = rows.dateheaders ?? rows.dateHeaders
  return {
    selector: requiredString(rows, "selector"),
    filters: parseFilters(rows.filters),
    ...(after !== null ? { after } : {}),
    ...(dateHeaders !== undefined
      ? { dateHeaders: parseFieldSelector(expectRecord(dateHeaders, "rows dateheaders")) }
      : {}),
  }
}

function parseFields(value: unknown): Readonly<Record<string, CardigannFieldSelector>> {
  if (value === undefined) return {}
  const record = expectRecord(value, "fields")
  const fields: Record<string, CardigannFieldSelector> = {}
  for (const [fieldName, fieldValue] of Object.entries(record)) {
    const field = expectRecord(fieldValue, `field ${fieldName}`)
    fields[fieldName] = parseFieldSelector(field)
  }
  return fields
}

function parseSelectorInputMap(
  value: unknown,
  label: string,
): Readonly<Record<string, CardigannFieldSelector>> {
  if (value === undefined) return {}
  const record = expectRecord(value, label)
  const fields: Record<string, CardigannFieldSelector> = {}
  for (const [fieldName, fieldValue] of Object.entries(record)) {
    fields[fieldName] = parseFieldSelector(expectRecord(fieldValue, `${label} ${fieldName}`))
  }
  return fields
}

function parseFieldSelector(field: Record<string, unknown>): CardigannFieldSelector {
  const selector = optionalScalarStringFromAny(field, ["selector"])
  const attribute = optionalScalarStringFromAny(field, ["attribute"])
  const text = optionalScalarStringFromAny(field, ["text"])
  const remove = optionalScalarStringFromAny(field, ["remove"])
  const cases = parseCaseMap(field.case)
  const defaultValue = optionalScalarStringFromAny(field, ["default", "defaultValue"])
  return {
    optional: optionalBoolean(field, "optional") ?? false,
    filters: parseFilters(field.filters),
    ...(selector !== null ? { selector } : {}),
    ...(attribute !== null ? { attribute } : {}),
    ...(text !== null ? { text } : {}),
    ...(remove !== null ? { remove } : {}),
    ...(Object.keys(cases).length > 0 ? { case: cases } : {}),
    ...(defaultValue !== null ? { defaultValue } : {}),
  }
}

function parseLoginErrors(value: unknown): ReadonlyArray<CardigannLoginError> {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error("login error must be a list")

  return value.map((item) => {
    const error = expectRecord(item, "login error")
    const selector = optionalScalarStringFromAny(error, ["selector"])
    const message = isRecord(error.message) ? parseFieldSelector(error.message) : undefined
    if (selector === null && message === undefined) {
      throw new Error("login error must include selector or message")
    }
    return {
      ...(selector !== null ? { selector } : {}),
      ...(message !== undefined ? { message } : {}),
    }
  })
}

function parseLoginTest(value: unknown): CardigannLoginTest | undefined {
  if (value === undefined) return undefined
  const test = expectRecord(value, "login test")
  const path = optionalString(test, "path")
  return {
    selector: requiredString(test, "selector"),
    ...(path !== null ? { path } : {}),
  }
}

function parseLoginCaptcha(value: unknown): CardigannLoginCaptcha | undefined {
  if (value === undefined) return undefined
  const captcha = expectRecord(value, "login captcha")
  const type = optionalScalarStringFromAny(captcha, ["type"])
  const selector = optionalScalarStringFromAny(captcha, ["selector"])
  const input = optionalScalarStringFromAny(captcha, ["input"])
  return {
    ...(type !== null ? { type } : {}),
    ...(selector !== null ? { selector } : {}),
    ...(input !== null ? { input } : {}),
  }
}

function parseCaseMap(value: unknown): Readonly<Record<string, string>> {
  if (value === undefined) return {}
  const record = expectRecord(value, "case")
  const cases: Record<string, string> = {}
  for (const [selector, caseValue] of Object.entries(record)) {
    cases[selector] = inputScalarToString(caseValue, `case ${selector}`).trim()
  }
  return cases
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
      inheritInputs:
        optionalBoolean(path, "inheritinputs") ?? optionalBoolean(path, "inheritInputs") ?? true,
      inputs: parseInputMap(path.inputs),
      headers: parseHeaderMap(path.headers),
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

function parseHeaderMap(value: unknown): Readonly<Record<string, string>> {
  if (value === undefined) return {}
  const record = expectRecord(value, "headers")
  const headers: Record<string, string> = {}
  for (const [key, val] of Object.entries(record)) {
    headers[key] = headerValueToString(val, `header ${key}`)
  }
  return headers
}

function headerValueToString(value: unknown, label: string): string {
  if (!Array.isArray(value)) return inputScalarToString(value, label)
  if (value.length === 0) throw new Error(`${label} must contain at least one value`)
  return inputScalarToString(value[0], `${label} value 0`)
}

function parseFilters(value: unknown): ReadonlyArray<CardigannFilter> {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error("filters must be a list")
  return value.map((item) => {
    const filter = expectRecord(item, "filter")
    return {
      name: requiredString(filter, "name").toLowerCase(),
      args: parseFilterArgs(filter.args),
    }
  })
}

function parseFilterArgs(value: unknown): ReadonlyArray<string> {
  if (value === undefined) return []
  if (Array.isArray(value)) {
    return value.map((item, index) => inputScalarToString(item, `filter arg ${index}`))
  }
  return [inputScalarToString(value, "filter arg")]
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
  const fields: Array<IndexerAuthField> = []
  for (const item of value) {
    const field = expectRecord(item, "auth field")
    const defaultValue = optionalScalarStringFromAny(field, ["default", "defaultValue"])
    const helpText = optionalScalarStringFromAny(field, ["helpText", "helptext", "help"])
    const options = parseAuthFieldOptions(field.options)
    const type = parseAuthFieldType(optionalString(field, "type") ?? "text")
    if (type === null) continue

    fields.push({
      name: requiredString(field, "name"),
      label: optionalString(field, "label") ?? requiredString(field, "name"),
      type,
      required: optionalBoolean(field, "required") ?? false,
      ...(helpText !== null ? { helpText } : {}),
      ...(defaultValue !== null ? { defaultValue } : {}),
      ...(options.length > 0 ? { options } : {}),
    })
  }
  return fields
}

function appendCaptchaAuthField(
  fields: ReadonlyArray<IndexerAuthField>,
  loginValue: unknown,
): ReadonlyArray<IndexerAuthField> {
  if (loginValue === undefined) return fields

  const login = expectRecord(loginValue, "login")
  const captcha = parseLoginCaptcha(login.captcha)
  if (captcha === undefined) return fields

  if (fields.some((field) => field.name.toLowerCase() === "cardiganncaptcha")) return fields

  return [
    ...fields,
    {
      name: "cardigannCaptcha",
      label: "CAPTCHA",
      type: "text",
      required: false,
      helpText: "Manual response for Cardigann login CAPTCHA prompts.",
    },
  ]
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
  if (isRecord(value)) {
    return Object.entries(value).map(([trackerCategory, category]) => {
      const trackerCategoryDesc = inputScalarToString(
        category,
        `category ${trackerCategory}`,
      ).trim()
      if (trackerCategory.trim().length === 0 || trackerCategoryDesc.length === 0) {
        throw new Error("categories must contain non-empty strings")
      }

      const newznabCategory = newznabFromCategoryName(trackerCategoryDesc)
      if (newznabCategory === null) {
        throw new Error("category must include a known cat or newznab category")
      }

      return {
        trackerCategory: trackerCategory.trim(),
        trackerCategoryDesc,
        newznabCategory,
      }
    })
  }

  if (!Array.isArray(value)) throw new Error("categories must be a list")
  return value.flatMap((item) => {
    const category = expectRecord(item, "category")
    const trackerCategory = requiredStringFromAny(category, ["tracker", "id"])
    const trackerCategoryDesc =
      optionalString(category, "description") ?? optionalString(category, "desc") ?? trackerCategory
    const defaultCategory = optionalBoolean(category, "default") === true
    const newznabCategories = resolveNewznabCategories(category)
    return newznabCategories.map((newznabCategory) => {
      const mapping: IndexerCategoryMapping = {
        trackerCategory,
        trackerCategoryDesc,
        newznabCategory,
      }
      return defaultCategory ? Object.assign(mapping, { defaultCategory: true }) : mapping
    })
  })
}

function resolveNewznabCategories(record: Record<string, unknown>): ReadonlyArray<number> {
  const explicit = record.newznab ?? record.newznabCategory
  if (explicit !== undefined) {
    const values = Array.isArray(explicit) ? explicit : [explicit]
    return uniqueNumbers(values.map((item) => positiveIntFromValue(item, "newznab")))
  }

  const category = record.cat
  const values = Array.isArray(category) ? category : [category]
  const resolved = values.flatMap((item) => {
    const newznabCategory = newznabFromCategoryName(item)
    return newznabCategory === null ? [] : [newznabCategory]
  })
  if (resolved.length > 0) return uniqueNumbers(resolved)

  throw new Error("category must include a known cat or newznab category")
}

function uniqueNumbers(values: ReadonlyArray<number>): ReadonlyArray<number> {
  return Array.from(new Set(values))
}

function newznabFromCategoryName(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value !== "string") return null

  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  return CATEGORY_NAME_TO_NEWZNAB.get(normalizeCategoryName(trimmed)) ?? null
}

function normalizeCategoryName(value: string): string {
  return value
    .trim()
    .replaceAll(/\s*\/\s*/g, "/")
    .replaceAll(/\s+/g, " ")
    .toLowerCase()
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

function parseScalarStringArray(value: unknown, label: string): ReadonlyArray<string> {
  if (value === undefined) return []
  const values = Array.isArray(value) ? value : [value]
  return values.map((item, index) => inputScalarToString(item, `${label} ${index}`).trim())
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

function parseLoginMethod(value: string): "get" | "post" | "cookie" | "oneurl" | "form" {
  const method = value.toLowerCase()
  if (
    method === "get" ||
    method === "post" ||
    method === "cookie" ||
    method === "oneurl" ||
    method === "form"
  ) {
    return method
  }
  throw new Error(`unsupported Cardigann login method: ${value}`)
}

function parseResponseType(value: string): CardigannResponseType {
  const type = value.toLowerCase()
  if (type === "html" || type === "json") return type
  if (type === "torznab" || type === "newznab" || type === "rss") return type
  if (type === "xml") return "torznab"
  throw new Error(`unsupported Cardigann response type: ${value}`)
}

function parsePrivacy(value: string): IndexerPrivacy {
  if (value === "public" || value === "private" || value === "semi_private") return value
  if (value === "semi-private") return "semi_private"
  throw new Error(`unsupported indexer privacy: ${value}`)
}

function parseAuthFieldType(value: string): IndexerAuthFieldType | null {
  const type = value.toLowerCase()
  if (type === "input" || type === "textbox") return "text"
  if (type === "cardiganncaptcha") return "text"
  if (type === "info" || type.startsWith("info_")) return "info"
  if (
    type === "text" ||
    type === "password" ||
    type === "cookie" ||
    type === "textarea" ||
    type === "select" ||
    type === "checkbox"
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

function optionalNonNegativeInt(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  if (value === undefined || value === null) return null
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim())
  throw new Error(`${key} must be a non-negative integer`)
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

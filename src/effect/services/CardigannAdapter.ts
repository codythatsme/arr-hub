import { Effect } from "effect"

import type {
  IndexerAdapterMetadata,
  IndexerAuthField,
  IndexerConfig,
  ReleaseCandidate,
  SearchQuery,
} from "../domain/indexer"
import { IndexerError } from "../errors"
import {
  type CardigannFieldSelector,
  type CardigannFilter,
  type CardigannLoginError,
  type CardigannLoginRuntime,
  type CardigannResponseType,
  type CardigannRuntimeDefinition,
  type CardigannRowsSelector,
  type CardigannSearchPath,
  getBuiltInCardigannRuntimeDefinition,
  parseCardigannRuntimeDefinitionYaml,
} from "./CardigannDefinitionLoader"
import type { IndexerAdapter } from "./IndexerAdapter"
import {
  checkTorznabError,
  fetchIndexerResponseText,
  parseIndexerXmlText,
  parseTorznabReleases,
} from "./TorznabAdapter"

export const cardigannYamlMetadata: IndexerAdapterMetadata = {
  displayName: "Cardigann YAML",
  protocolAffinity: "torrent",
  authModel: "Definition fields",
}

const SEARCH_TYPE_MAP = {
  general: "search",
  movie: "movie",
  tv: "tvsearch",
} as const

type TemplateValue = string | ReadonlyArray<string>

interface CardigannSearchRequest {
  readonly url: URL
  readonly init: RequestInit
  readonly responseType: CardigannResponseType
  readonly noResultsMessage?: string
  readonly variables: Record<string, TemplateValue>
}

interface CardigannLoginRequest {
  readonly url: URL
  readonly init: RequestInit
}

interface HtmlElementMatch {
  readonly tagName: string | null
  readonly attributes: Readonly<Record<string, string>>
  readonly innerHtml: string
  readonly outerHtml: string
  readonly sourceIndex?: number
  readonly innerHtmlStartIndex?: number
  readonly firstChild?: boolean
  readonly lastChild?: boolean
  readonly childIndex?: number
}

interface SimpleHtmlSelector {
  readonly tag: string | null
  readonly id: string | null
  readonly classes: ReadonlyArray<string>
  readonly attributes: ReadonlyArray<{
    readonly name: string
    readonly operator: string | null
    readonly value: string
  }>
  readonly filters: ReadonlyArray<JsonSelectorFilter>
}

interface HtmlSelectorStep {
  readonly token: string
  readonly direct: boolean
}

interface FormLoginParams {
  readonly params: URLSearchParams
  readonly queryParams: URLSearchParams
}

function loadRuntimeDefinition(
  config: IndexerConfig,
): Effect.Effect<CardigannRuntimeDefinition, IndexerError> {
  if (config.definitionYaml && config.definitionYaml.trim().length > 0) {
    return Effect.try({
      try: () => parseCardigannRuntimeDefinitionYaml(config.definitionYaml ?? ""),
      catch: (error) =>
        new IndexerError({
          indexerId: config.id,
          indexerName: config.name,
          reason: "invalid_response",
          message: error instanceof Error ? error.message : "invalid Cardigann definition YAML",
          retryable: false,
        }),
    })
  }

  const definition = getBuiltInCardigannRuntimeDefinition(config.definitionKey)
  if (definition) return Effect.succeed(definition)

  return Effect.fail(
    new IndexerError({
      indexerId: config.id,
      indexerName: config.name,
      reason: "invalid_response",
      message: config.definitionKey
        ? `unknown Cardigann definition: ${config.definitionKey}`
        : "Cardigann indexer is missing a definition key",
      retryable: false,
    }),
  )
}

function requestedSearchType(
  definition: CardigannRuntimeDefinition,
  query: SearchQuery,
): string | null {
  const requested = SEARCH_TYPE_MAP[query.type]
  if (definition.capabilities.searchTypes.includes(requested)) return requested
  return definition.capabilities.searchTypes.includes("search") ? "search" : null
}

function mappedTrackerCategories(
  definition: CardigannRuntimeDefinition,
  query: SearchQuery,
): ReadonlyArray<string> {
  const defaultCategories = uniqueStrings(
    definition.categories
      .filter((category) => category.defaultCategory === true)
      .map((category) => category.trackerCategory),
  )
  if (!query.categories || query.categories.length === 0) return defaultCategories

  const requested = new Set(query.categories)
  const mapped = uniqueStrings(
    definition.categories
      .filter((category) => requested.has(category.newznabCategory))
      .map((category) => category.trackerCategory),
  )
  return mapped.length > 0 ? mapped : defaultCategories
}

function uniqueStrings(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return Array.from(new Set(values))
}

function categoriesForPath(
  path: CardigannSearchPath,
  trackerCategories: ReadonlyArray<string>,
): ReadonlyArray<string> | null {
  if (path.categories.length === 0 || trackerCategories.length === 0) return trackerCategories

  const negated = path.categories[0] === "!"
  const configured = negated ? path.categories.slice(1) : path.categories
  const selected = new Set(configured)

  if (negated) {
    const blocked = trackerCategories.some((category) => selected.has(category))
    return blocked ? null : trackerCategories.filter((category) => !selected.has(category))
  }

  const narrowed = trackerCategories.filter((category) => selected.has(category))
  return narrowed.length > 0 ? narrowed : null
}

function configKeyVariants(key: string): ReadonlyArray<string> {
  const trimmed = key.trim()
  if (trimmed.length === 0) return []

  const variants = new Set([trimmed, trimmed.toLowerCase(), trimmed.toUpperCase()])
  variants.add(`${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`)
  if (/^api_?key$/i.test(trimmed)) {
    variants.add("APIKey")
    variants.add("ApiKey")
  }
  return Array.from(variants)
}

function checkboxTemplateValue(value: string): string {
  const normalized = value.trim().toLowerCase()
  return normalized === "true" ||
    normalized === "1" ||
    normalized === "on" ||
    normalized === "yes" ||
    normalized === ".true"
    ? "True"
    : ""
}

function configFieldTemplateValue(fieldType: IndexerAuthField["type"], value: string): string {
  if (fieldType === "info") return ""
  return fieldType === "checkbox" ? checkboxTemplateValue(value) : value
}

function assignConfigTemplateVariable(
  variables: Record<string, string>,
  key: string,
  value: string,
): void {
  for (const variant of configKeyVariants(key)) {
    variables[`.Config.${variant}`] = value
  }
}

function configTemplateVariables(
  config: IndexerConfig,
  siteLink: string,
  authFields: ReadonlyArray<IndexerAuthField>,
): Record<string, string> {
  const variables: Record<string, string> = {
    ".Config.sitelink": siteLink,
    ".False": "",
    ".Today.Year": String(new Date().getFullYear()),
    ".True": "True",
  }
  const fieldTypesByName = new Map(
    authFields.map((field) => [field.name.toLowerCase(), field.type]),
  )

  for (const field of authFields) {
    if (field.type === "info") continue
    if (field.defaultValue === undefined) continue
    assignConfigTemplateVariable(
      variables,
      field.name,
      configFieldTemplateValue(field.type, field.defaultValue),
    )
  }

  if (config.apiKey.length > 0) {
    assignConfigTemplateVariable(variables, "apiKey", config.apiKey)
  } else {
    variables[".Config.APIKey"] ??= ""
    variables[".Config.ApiKey"] ??= ""
    variables[".Config.apiKey"] ??= ""
  }

  for (const [key, value] of Object.entries(config.configValues ?? {})) {
    const fieldType = fieldTypesByName.get(key.toLowerCase()) ?? "text"
    if (fieldType === "info") continue
    assignConfigTemplateVariable(variables, key, configFieldTemplateValue(fieldType, value))
  }

  return variables
}

function templateVariables(
  config: IndexerConfig,
  query: SearchQuery,
  queryType: string,
  trackerCategories: ReadonlyArray<string>,
  keywords: string,
  siteLink: string,
  authFields: ReadonlyArray<IndexerAuthField>,
): Record<string, TemplateValue> {
  const categoryStrings = (query.categories ?? []).map(String)
  const term = query.term.trim()
  return {
    ...configTemplateVariables(config, siteLink, authFields),
    ".Query.Type": queryType,
    ".Query.Q": term,
    ".Query.Keywords": term,
    ".Query.Categories": categoryStrings,
    ".Query.Limit": query.limit ? String(query.limit) : "",
    ".Query.Offset": query.offset !== undefined ? String(query.offset) : "",
    ".Query.Extended": query.extended ?? "",
    ".Query.IMDBID": query.imdbId ?? "",
    ".Query.IMDBIDShort": query.imdbId?.replace(/^tt/, "") ?? "",
    ".Query.TMDBID": query.tmdbId ? String(query.tmdbId) : "",
    ".Query.TVDBID": query.tvdbId ? String(query.tvdbId) : "",
    ".Query.Season": query.season ? String(query.season) : "",
    ".Query.Ep": query.episode ? String(query.episode) : "",
    ".Query.Episode": query.episode ? String(query.episode) : "",
    ".Keywords": keywords,
    ".Categories": trackerCategories,
  }
}

function splitTemplatePipeline(expression: string): ReadonlyArray<string> {
  const parts: Array<string> = []
  let current = ""
  let quote: string | null = null

  for (const char of expression) {
    if ((char === `"` || char === `'`) && quote === null) {
      quote = char
    } else if (char === quote) {
      quote = null
    }

    if (char === "|" && quote === null) {
      parts.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }

  if (current.trim().length > 0) parts.push(current.trim())
  return parts
}

function parseFilterCall(expression: string): {
  readonly name: string
  readonly args: ReadonlyArray<string>
} {
  const tokens = Array.from(expression.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)).map(
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  )
  const [name = "", ...args] = tokens
  return { name: name.toLowerCase(), args }
}

function templateValueToString(value: TemplateValue | undefined): string {
  if (typeof value === "string") return value
  return value ? value.join(",") : ""
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[\\^$*+?.()|[\]{}-]/g, "\\$&")
}

function queryStringValue(value: string, key: string): string {
  const trimmedKey = key.trim()
  if (trimmedKey.length === 0) return value

  const queryStart = value.indexOf("?")
  let query = queryStart >= 0 ? value.slice(queryStart + 1) : value
  const fragmentStart = query.indexOf("#")
  if (fragmentStart >= 0) query = query.slice(0, fragmentStart)

  return new URLSearchParams(query).get(trimmedKey) ?? ""
}

function splitFilterValue(value: string, separator: string, position: string): string {
  const splitOn = separator[0]
  if (!splitOn) return value

  const index = Number.parseInt(position, 10)
  if (!Number.isFinite(index)) return value

  const parts = value.split(splitOn)
  const normalizedIndex = index < 0 ? parts.length + index : index
  return parts[normalizedIndex] ?? ""
}

function urlDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function relativeTimeDate(value: string, now: number = Date.now()): Date | null {
  const normalized = value.trim().toLowerCase()
  if (normalized.length === 0) return null
  if (normalized === "now" || normalized === "just now" || normalized === "today") {
    return new Date(now)
  }
  if (normalized === "yesterday") return new Date(now - 86_400_000)

  const match = normalized.match(
    /^(?:about\s+|approximately\s+|approx\.?\s+)?(?:(in)\s+)?(\d+(?:\.\d+)?)\s*([a-z]+)\s*(?:ago)?$/,
  )
  if (!match) return null

  const amount = Number(match[2])
  if (!Number.isFinite(amount)) return null

  const unit = match[3] ?? ""
  const milliseconds =
    unit === "s" || unit.startsWith("sec")
      ? amount * 1_000
      : unit === "m" || unit.startsWith("min")
        ? amount * 60_000
        : unit === "h" || unit.startsWith("hour") || unit.startsWith("hr")
          ? amount * 3_600_000
          : unit === "d" || unit.startsWith("day")
            ? amount * 86_400_000
            : unit === "w" || unit.startsWith("week")
              ? amount * 7 * 86_400_000
              : unit === "mo" || unit.startsWith("month")
                ? amount * 30 * 86_400_000
                : unit === "y" || unit.startsWith("year")
                  ? amount * 365 * 86_400_000
                  : Number.NaN
  if (!Number.isFinite(milliseconds)) return null

  const direction = match[1] === "in" ? 1 : -1
  return new Date(now + direction * milliseconds)
}

const MONTH_BY_NAME: Readonly<Record<string, number>> = {
  apr: 4,
  april: 4,
  aug: 8,
  august: 8,
  dec: 12,
  december: 12,
  feb: 2,
  february: 2,
  jan: 1,
  january: 1,
  jul: 7,
  july: 7,
  jun: 6,
  june: 6,
  mar: 3,
  march: 3,
  may: 5,
  nov: 11,
  november: 11,
  oct: 10,
  october: 10,
  sep: 9,
  sept: 9,
  september: 9,
}

function dateFormatTokenRegex(token: string): string | null {
  switch (token) {
    case "yyyy":
      return "(?<year>\\d{4})"
    case "yy":
      return "(?<year2>\\d{2})"
    case "MMMM":
      return "(?<monthName>[A-Za-z]+)"
    case "MMM":
      return "(?<monthName>[A-Za-z]{3,}\\.?|[A-Za-z]+)"
    case "MM":
      return "(?<month>\\d{2})"
    case "M":
      return "(?<month>\\d{1,2})"
    case "dddd":
    case "ddd":
      return "[A-Za-z]+\\.?"
    case "dd":
      return "(?<day>\\d{2})"
    case "d":
      return "(?<day>\\d{1,2})"
    case "HH":
      return "(?<hour24>\\d{2})"
    case "H":
      return "(?<hour24>\\d{1,2})"
    case "hh":
      return "(?<hour12>\\d{2})"
    case "h":
      return "(?<hour12>\\d{1,2})"
    case "mm":
      return "(?<minute>\\d{2})"
    case "m":
      return "(?<minute>\\d{1,2})"
    case "ss":
      return "(?<second>\\d{2})"
    case "s":
      return "(?<second>\\d{1,2})"
    case "ffff":
    case "fff":
    case "ff":
    case "f":
      return "(?<fraction>\\d{1,7})"
    case "tt":
      return "(?<ampm>AM|PM|A\\.M\\.|P\\.M\\.)"
    case "zzz":
      return "(?<offset>Z|UTC|GMT|[+-]\\d{1,2}:\\d{2})"
    case "zz":
      return "(?<offset>Z|UTC|GMT|[+-]\\d{2})"
    case "z":
      return "(?<offset>Z|UTC|GMT|[+-]\\d{1,2})"
    case "K":
      return "(?<offset>Z|UTC|GMT|[+-]\\d{1,2}:\\d{2})?"
    default:
      return null
  }
}

const DOT_NET_DATE_FORMAT_TOKENS = [
  "yyyy",
  "MMMM",
  "dddd",
  "ffff",
  "MMM",
  "ddd",
  "fff",
  "zzz",
  "yy",
  "MM",
  "dd",
  "HH",
  "hh",
  "mm",
  "ss",
  "ff",
  "tt",
  "zz",
  "M",
  "d",
  "H",
  "h",
  "m",
  "s",
  "f",
  "z",
  "K",
] as const

function dotNetDateFormatRegex(format: string): RegExp | null {
  let pattern = "^"
  for (let index = 0; index < format.length; ) {
    const char = format[index] ?? ""
    if (char === "'" || char === `"`) {
      const end = format.indexOf(char, index + 1)
      if (end < 0) return null
      pattern += escapeRegExp(format.slice(index + 1, end))
      index = end + 1
      continue
    }

    if (char === "\\") {
      pattern += escapeRegExp(format[index + 1] ?? "")
      index += 2
      continue
    }

    const token = DOT_NET_DATE_FORMAT_TOKENS.find((candidate) =>
      format.startsWith(candidate, index),
    )
    const tokenRegex = token ? dateFormatTokenRegex(token) : null
    if (token && tokenRegex) {
      pattern += tokenRegex
      index += token.length
      continue
    }

    pattern += /\s/.test(char) ? "\\s+" : escapeRegExp(char)
    index += 1
  }
  pattern += "$"

  try {
    return new RegExp(pattern, "i")
  } catch {
    return null
  }
}

function twoDigitYear(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return parsed <= 29 ? 2000 + parsed : 1900 + parsed
}

function parseTimezoneOffsetMinutes(value: string | undefined): number | null {
  if (value === undefined || value.length === 0) return 0
  const normalized = value.toUpperCase()
  if (normalized === "Z" || normalized === "UTC" || normalized === "GMT") return 0

  const match = normalized.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/)
  if (!match) return null

  const hours = Number.parseInt(match[2] ?? "", 10)
  const minutes = match[3] ? Number.parseInt(match[3], 10) : 0
  if (hours > 23 || minutes > 59) return null

  const total = hours * 60 + minutes
  return match[1] === "-" ? -total : total
}

function parsedMonth(groups: Record<string, string | undefined>): number | null {
  if (groups.month !== undefined) {
    const month = Number.parseInt(groups.month, 10)
    return month >= 1 && month <= 12 ? month : null
  }

  const monthName = groups.monthName?.replace(/\.$/, "").toLowerCase()
  if (monthName === undefined) return 1
  return MONTH_BY_NAME[monthName] ?? null
}

function parseDotNetDate(value: string, format: string): Date | null {
  const trimmed = value.trim()
  const trimmedFormat = format.trim()
  if (trimmed.length === 0 || trimmedFormat.length === 0) return null

  const regex = dotNetDateFormatRegex(trimmedFormat)
  const match = regex?.exec(trimmed)
  const groups = match?.groups as Record<string, string | undefined> | undefined
  if (!groups) return null

  const now = new Date()
  const year =
    groups.year !== undefined
      ? Number.parseInt(groups.year, 10)
      : groups.year2 !== undefined
        ? twoDigitYear(groups.year2)
        : now.getUTCFullYear()
  const month = parsedMonth(groups)
  const day = groups.day !== undefined ? Number.parseInt(groups.day, 10) : 1
  const hour24 = groups.hour24 !== undefined ? Number.parseInt(groups.hour24, 10) : undefined
  const hour12 = groups.hour12 !== undefined ? Number.parseInt(groups.hour12, 10) : undefined
  const minute = groups.minute !== undefined ? Number.parseInt(groups.minute, 10) : 0
  const second = groups.second !== undefined ? Number.parseInt(groups.second, 10) : 0
  const millisecond =
    groups.fraction !== undefined
      ? Number.parseInt(groups.fraction.padEnd(3, "0").slice(0, 3), 10)
      : 0

  if (month === null || day < 1 || day > 31 || minute > 59 || second > 59) return null

  const ampm = groups.ampm?.replaceAll(".", "").toUpperCase()
  let hour = hour24 ?? hour12 ?? 0
  if (hour12 !== undefined) {
    if (hour12 < 1 || hour12 > 12) return null
    hour = ampm === "PM" && hour12 < 12 ? hour12 + 12 : hour12
    if (ampm === "AM" && hour12 === 12) hour = 0
  }
  if (hour < 0 || hour > 23) return null

  const offsetMinutes = parseTimezoneOffsetMinutes(groups.offset)
  if (offsetMinutes === null) return null

  const localTimestamp = Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
  const localDate = new Date(localTimestamp)
  if (
    localDate.getUTCFullYear() !== year ||
    localDate.getUTCMonth() !== month - 1 ||
    localDate.getUTCDate() !== day ||
    localDate.getUTCHours() !== hour ||
    localDate.getUTCMinutes() !== minute ||
    localDate.getUTCSeconds() !== second
  ) {
    return null
  }

  return new Date(localTimestamp - offsetMinutes * 60_000)
}

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: `"`,
}

function htmlDecode(value: string): string {
  return value.replace(/&(#x[\dA-Fa-f]+|#\d+|[A-Za-z]+);/g, (match, entity: string) => {
    const normalized = entity.toLowerCase()
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16)
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10)
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match
    }
    return HTML_ENTITIES[normalized] ?? match
  })
}

function htmlEncode(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll(`"`, "&quot;")
    .replaceAll("'", "&#39;")
}

function applyTemplateFilter(
  value: TemplateValue | undefined,
  filter: string,
  args: ReadonlyArray<string>,
): TemplateValue {
  if (filter === "join") {
    const separator = args[0] ?? ","
    return Array.isArray(value) ? value.join(separator) : templateValueToString(value)
  }

  const text = templateValueToString(value)
  switch (filter) {
    case "append":
      return `${text}${args[0] ?? ""}`
    case "default":
      return text.length > 0 ? text : (args[0] ?? "")
    case "htmldecode":
      return htmlDecode(text)
    case "htmlencode":
      return htmlEncode(text)
    case "lower":
    case "lowercase":
    case "tolower":
      return text.toLowerCase()
    case "prepend":
      return `${args[0] ?? ""}${text}`
    case "querystring":
      return queryStringValue(text, args[0] ?? "")
    case "replace":
      return args.length >= 2 ? text.split(args[0]).join(args[1]) : text
    case "split":
      return splitFilterValue(text, args[0] ?? "", args[1] ?? "0")
    case "trim":
      return text.trim()
    case "upper":
    case "uppercase":
    case "toupper":
      return text.toUpperCase()
    case "queryescape":
    case "urlencode":
    case "urlencodecomponent":
      return encodeURIComponent(text)
    case "urldecode":
    case "urldecodecomponent":
      return urlDecode(text)
    default:
      return text
  }
}

function normalizeTemplateReference(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) return trimmed.slice(1, -1).trim()
  return trimmed
}

function templateValueTruthy(value: TemplateValue | undefined): boolean {
  if (typeof value === "string") return value.trim().length > 0
  return Array.isArray(value) && value.length > 0
}

function templateTokenValue(
  token: string,
  variables: Record<string, TemplateValue>,
): TemplateValue {
  const reference = normalizeTemplateReference(token)
  if (reference.startsWith(".")) return variables[reference] ?? ""
  return reference
}

function applyTemplateFunction(
  name: string,
  args: ReadonlyArray<string>,
  variables: Record<string, TemplateValue>,
): TemplateValue | null {
  switch (name) {
    case "and": {
      let result: TemplateValue = ""
      for (const arg of args) {
        result = templateTokenValue(arg, variables)
        if (!templateValueTruthy(result)) return result
      }
      return result
    }
    case "eq": {
      const left = templateValueToString(templateTokenValue(args[0] ?? "", variables))
      const right = templateValueToString(templateTokenValue(args[1] ?? "", variables))
      return left === right ? (variables[".True"] ?? "True") : (variables[".False"] ?? "")
    }
    case "join": {
      const value = templateTokenValue(args[0] ?? "", variables)
      const separator = args[1] ?? ","
      return Array.isArray(value) ? value.join(separator) : templateValueToString(value)
    }
    case "ne": {
      const left = templateValueToString(templateTokenValue(args[0] ?? "", variables))
      const right = templateValueToString(templateTokenValue(args[1] ?? "", variables))
      return left !== right ? (variables[".True"] ?? "True") : (variables[".False"] ?? "")
    }
    case "or": {
      let result: TemplateValue = ""
      for (const arg of args) {
        result = templateTokenValue(arg, variables)
        if (templateValueTruthy(result)) return result
      }
      return result
    }
    case "re_replace": {
      const value = templateValueToString(templateTokenValue(args[0] ?? "", variables))
      const pattern = args[1]
      if (!pattern) return value

      try {
        return value.replace(new RegExp(pattern, "g"), args[2] ?? "")
      } catch {
        return value
      }
    }
    default:
      return null
  }
}

function templateExpressionValue(
  expression: string,
  variables: Record<string, TemplateValue>,
): TemplateValue {
  const [key = "", ...filters] = splitTemplatePipeline(expression)
  const call = parseFilterCall(key)
  let value =
    applyTemplateFunction(call.name, call.args, variables) ?? templateTokenValue(key, variables)

  for (const filterExpression of filters) {
    const filter = parseFilterCall(filterExpression)
    value = applyTemplateFilter(value, filter.name, filter.args)
  }

  return value
}

function renderConditionalTemplates(
  template: string,
  variables: Record<string, TemplateValue>,
): string {
  const ifElsePattern =
    /\{\{\s*if\s+([^}]+?)\s*\}\}([\S\s]*?)\{\{\s*else\s*\}\}([\S\s]*?)\{\{\s*end\s*\}\}/g
  const ifPattern = /\{\{\s*if\s+([^}]+?)\s*\}\}([\S\s]*?)\{\{\s*end\s*\}\}/g

  let rendered = template
  let previous = ""
  while (rendered !== previous) {
    previous = rendered
    rendered = rendered
      .replaceAll(ifElsePattern, (_match, condition: string, onTrue: string, onFalse: string) =>
        templateValueTruthy(templateExpressionValue(condition, variables)) ? onTrue : onFalse,
      )
      .replaceAll(ifPattern, (_match, condition: string, onTrue: string) =>
        templateValueTruthy(templateExpressionValue(condition, variables)) ? onTrue : "",
      )
  }
  return rendered
}

function renderRangeTemplates(template: string, variables: Record<string, TemplateValue>): string {
  return template.replaceAll(
    /\{\{\s*range\s+(?:(\$\w+)\s*,\s*\$\w+\s*:=\s*)?(\.[^}\s]+)\s*\}\}([\S\s]*?)\{\{\s*end\s*\}\}/g,
    (_match, indexVariable: string | undefined, key: string, body: string) => {
      const value = variables[key]
      if (!Array.isArray(value)) return ""

      return value
        .map((item, index) => {
          let rendered = body.replaceAll(/\{\{\s*\.\s*\}\}/g, () => item)
          if (indexVariable) {
            rendered = rendered.replaceAll(
              new RegExp(`\\{\\{\\s*${escapeRegExp(indexVariable)}\\s*\\}\\}`, "g"),
              String(index),
            )
          }
          return rendered
        })
        .join("")
    },
  )
}

function renderTemplate(template: string, variables: Record<string, TemplateValue>): string {
  return renderConditionalTemplates(renderRangeTemplates(template, variables), variables).replace(
    /\{\{\s*([^}]+?)\s*\}\}/g,
    (_match, expression: string) => {
      return templateValueToString(templateExpressionValue(expression, variables))
    },
  )
}

function trimCharacters(value: string, chars: string): string {
  const escaped = escapeRegExp(chars)
  return value.replace(new RegExp(`^[${escaped}]+|[${escaped}]+$`, "g"), "")
}

function stripDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .normalize("NFC")
}

function validFilename(value: string): string {
  const invalidCharacters = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"])
  return Array.from(value, (char) =>
    invalidCharacters.has(char) || char.charCodeAt(0) < 32 ? "_" : char,
  )
    .join("")
    .trim()
}

function parseFuzzyDate(value: string): Date | null {
  const normalized = value.trim().replaceAll(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi, "$1")
  const date = normalized.length > 0 ? new Date(normalized) : new Date()
  return Number.isNaN(date.getTime()) ? null : date
}

function validatedTerms(value: string, allowed: string): string {
  const delimiters = /[, /)(.;[\]"|:]+/
  const valueTerms = new Set(
    value
      .toLowerCase()
      .split(delimiters)
      .map((term) => term.trim())
      .filter((term) => term.length > 0),
  )

  return allowed
    .split(delimiters)
    .map((term) => term.trim())
    .filter((term) => term.length > 0 && valueTerms.has(term.toLowerCase()))
    .join(", ")
}

type JsonPathToken = "*" | number | string

interface JsonRowMatch {
  readonly value: unknown
  readonly parent: unknown
}

interface JsonSelectorFilter {
  readonly name: string
  readonly selector: string
}

interface JsonSelector {
  readonly path: string
  readonly filters: ReadonlyArray<JsonSelectorFilter>
}

function parseJsonPath(path: string): ReadonlyArray<JsonPathToken> | null {
  const text = path.trim()
  if (text.length === 0) return []

  const tokens: Array<JsonPathToken> = []
  let index = text.startsWith("$") ? 1 : 0

  while (index < text.length) {
    const char = text[index]
    if (char === ".") {
      index += 1
      if (text[index] === "*") {
        tokens.push("*")
        index += 1
        continue
      }

      const start = index
      while (index < text.length && text[index] !== "." && text[index] !== "[") {
        index += 1
      }

      const key = text.slice(start, index)
      if (key.length === 0) return null
      tokens.push(key)
      continue
    }

    if (char === "[") {
      const close = text.indexOf("]", index + 1)
      if (close === -1) return null

      const raw = text.slice(index + 1, close).trim()
      if (raw === "*") {
        tokens.push("*")
      } else if (/^\d+$/.test(raw)) {
        tokens.push(Number.parseInt(raw, 10))
      } else {
        const quote = raw[0]
        if ((quote !== `"` && quote !== "'") || !raw.endsWith(quote)) return null
        tokens.push(raw.slice(1, -1))
      }

      index = close + 1
      continue
    }

    const start = index
    while (index < text.length && text[index] !== "." && text[index] !== "[") {
      index += 1
    }

    const key = text.slice(start, index)
    if (key.length === 0) return null
    tokens.push(key)
  }

  return tokens
}

function jsonSelectorFilterStart(text: string): number {
  let bracketDepth = 0
  let quote: string | null = null

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ""
    if ((char === `"` || char === "'") && bracketDepth > 0) {
      quote = quote === char ? null : (quote ?? char)
    } else if (quote === null && char === "[") {
      bracketDepth += 1
    } else if (quote === null && char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1)
    } else if (quote === null && bracketDepth === 0 && char === ":") {
      return index
    }
  }

  return -1
}

function splitJsonSelectorList(selector: string): ReadonlyArray<string> {
  const selectors: Array<string> = []
  let current = ""
  let bracketDepth = 0
  let parenDepth = 0
  let quote: string | null = null

  for (const char of selector.trim()) {
    if ((char === `"` || char === "'") && (bracketDepth > 0 || parenDepth > 0)) {
      quote = quote === char ? null : (quote ?? char)
    } else if (quote === null && char === "[") {
      bracketDepth += 1
    } else if (quote === null && char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1)
    } else if (quote === null && char === "(") {
      parenDepth += 1
    } else if (quote === null && char === ")") {
      parenDepth = Math.max(0, parenDepth - 1)
    }

    if (quote === null && bracketDepth === 0 && parenDepth === 0 && char === ",") {
      const selected = current.trim()
      if (selected.length > 0) selectors.push(selected)
      current = ""
    } else {
      current += char
    }
  }

  const selected = current.trim()
  if (selected.length > 0) selectors.push(selected)
  return selectors
}

function parseJsonSelectorFilters(suffix: string): ReadonlyArray<JsonSelectorFilter> | null {
  const filters: Array<JsonSelectorFilter> = []
  let index = 0

  while (index < suffix.length) {
    while (/\s/.test(suffix[index] ?? "")) index += 1
    if (index >= suffix.length) break
    if (suffix[index] !== ":") return null
    index += 1

    const nameStart = index
    while (/[A-Za-z-]/.test(suffix[index] ?? "")) index += 1
    const name = suffix.slice(nameStart, index).trim().toLowerCase()
    if (name.length === 0) return null

    while (/\s/.test(suffix[index] ?? "")) index += 1
    if (suffix[index] !== "(") {
      if (name === "first" || name === "last" || name === "even" || name === "odd") {
        filters.push({ name, selector: "" })
        continue
      }
      return null
    }
    index += 1

    const selectorStart = index
    let depth = 1
    let quote: string | null = null
    while (index < suffix.length && depth > 0) {
      const char = suffix[index] ?? ""
      if (quote !== null) {
        if (char === quote) quote = null
      } else if (char === `"` || char === "'") {
        quote = char
      } else if (char === "(") {
        depth += 1
      } else if (char === ")") {
        depth -= 1
      }
      index += 1
    }
    if (depth !== 0) return null

    filters.push({
      name,
      selector: suffix.slice(selectorStart, index - 1).trim(),
    })
  }

  return filters
}

function parseHtmlSelectorFilters(suffix: string): ReadonlyArray<JsonSelectorFilter> | null {
  const filters: Array<JsonSelectorFilter> = []
  let index = 0

  while (index < suffix.length) {
    while (/\s/.test(suffix[index] ?? "")) index += 1
    if (index >= suffix.length) break
    if (suffix[index] !== ":") return null
    index += 1

    const nameStart = index
    while (/[A-Za-z-]/.test(suffix[index] ?? "")) index += 1
    const name = suffix.slice(nameStart, index).trim().toLowerCase()
    if (name.length === 0) return null

    while (/\s/.test(suffix[index] ?? "")) index += 1
    if (suffix[index] !== "(") {
      filters.push({ name, selector: "" })
      continue
    }
    index += 1

    const selectorStart = index
    let depth = 1
    let quote: string | null = null
    while (index < suffix.length && depth > 0) {
      const char = suffix[index] ?? ""
      if (quote !== null) {
        if (char === quote) quote = null
      } else if (char === `"` || char === "'") {
        quote = char
      } else if (char === "(") {
        depth += 1
      } else if (char === ")") {
        depth -= 1
      }
      index += 1
    }
    if (depth !== 0) return null

    filters.push({
      name,
      selector: suffix.slice(selectorStart, index - 1).trim(),
    })
  }

  return filters
}

function parseJsonSelector(selector: string): JsonSelector | null {
  const text = selector.trim()
  const filterStart = jsonSelectorFilterStart(text)
  if (filterStart < 0) return { path: text, filters: [] }

  const filters = parseJsonSelectorFilters(text.slice(filterStart))
  if (filters === null) return null
  return {
    path: text.slice(0, filterStart).trim(),
    filters,
  }
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function selectJsonPathValues(
  value: unknown,
  tokens: ReadonlyArray<JsonPathToken>,
): ReadonlyArray<unknown> {
  let values: ReadonlyArray<unknown> = [value]

  for (const token of tokens) {
    const next: Array<unknown> = []
    for (const current of values) {
      if (token === "*") {
        if (Array.isArray(current)) {
          next.push(...current)
        } else if (isJsonRecord(current)) {
          next.push(...Object.values(current))
        }
      } else if (typeof token === "number") {
        if (Array.isArray(current) && token < current.length) next.push(current[token])
      } else if (isJsonRecord(current) && Object.hasOwn(current, token)) {
        next.push(current[token])
      }
    }
    values = next
  }

  return values
}

function jsonSelectorText(value: unknown): string {
  return jsonValueToString(value)
}

function jsonSelectorMatches(value: unknown, filters: ReadonlyArray<JsonSelectorFilter>): boolean {
  return filters.every((filter) => {
    if (isJsonPositionalSelectorFilter(filter)) return true
    switch (filter.name) {
      case "contains":
        return jsonSelectorText(value).includes(filter.selector)
      case "has":
        return jsonSelectorExists(value, filter.selector)
      case "not":
        return !jsonSelectorExists(value, filter.selector)
      default:
        return true
    }
  })
}

function isJsonPositionalSelectorFilter(filter: JsonSelectorFilter): boolean {
  return (
    filter.name === "eq" ||
    filter.name === "first" ||
    filter.name === "last" ||
    filter.name === "even" ||
    filter.name === "odd" ||
    filter.name === "gt" ||
    filter.name === "lt"
  )
}

function jsonSelectorPositionIndex(filter: JsonSelectorFilter, length: number): number | null {
  if (filter.name === "first") return 0
  if (filter.name === "last") return length - 1
  if (filter.name !== "eq") return null

  const index = Number.parseInt(filter.selector, 10)
  if (!Number.isFinite(index)) return null
  return index < 0 ? length + index : index
}

function applyJsonPositionalSelectorFilter(
  values: ReadonlyArray<unknown>,
  filter: JsonSelectorFilter,
): ReadonlyArray<unknown> {
  switch (filter.name) {
    case "eq":
    case "first":
    case "last": {
      const index = jsonSelectorPositionIndex(filter, values.length)
      const value = index !== null ? values[index] : undefined
      return value === undefined ? [] : [value]
    }
    case "even":
      return values.filter((_, index) => index % 2 === 0)
    case "odd":
      return values.filter((_, index) => index % 2 === 1)
    case "gt": {
      const index = Number.parseInt(filter.selector, 10)
      return Number.isFinite(index) ? values.filter((_, itemIndex) => itemIndex > index) : values
    }
    case "lt": {
      const index = Number.parseInt(filter.selector, 10)
      return Number.isFinite(index) ? values.filter((_, itemIndex) => itemIndex < index) : values
    }
    default:
      return values
  }
}

function applyJsonSelectorFilters(
  values: ReadonlyArray<unknown>,
  filters: ReadonlyArray<JsonSelectorFilter>,
): ReadonlyArray<unknown> {
  return filters.reduce(
    (current, filter) =>
      isJsonPositionalSelectorFilter(filter)
        ? applyJsonPositionalSelectorFilter(current, filter)
        : current.filter((item) => jsonSelectorMatches(item, [filter])),
    values,
  )
}

function selectJsonSelectorValues(
  value: unknown,
  selectorText: string,
): ReadonlyArray<unknown> | null {
  const selectorList = splitJsonSelectorList(selectorText)
  if (selectorList.length === 0) return []
  if (selectorList.length > 1) {
    const selected: Array<unknown> = []
    for (const selectorItem of selectorList) {
      const values = selectJsonSelectorValues(value, selectorItem)
      if (values === null) return null
      selected.push(...values)
    }
    return selected
  }

  const selector = parseJsonSelector(selectorText)
  if (selector === null) return null

  const tokens = parseJsonPath(selector.path)
  if (tokens === null) return null

  const selected = selectJsonPathValues(value, tokens)
  if (selector.filters.length === 0) return selected

  const filterValues =
    selector.filters.some((filter) => isJsonPositionalSelectorFilter(filter)) &&
    selected.length === 1 &&
    Array.isArray(selected[0])
      ? (selected[0] as ReadonlyArray<unknown>)
      : selected
  return applyJsonSelectorFilters(filterValues, selector.filters)
}

function jsonSelectorExists(value: unknown, selectorText: string): boolean {
  const selected = selectJsonSelectorValues(value, selectorText)
  return selected !== null && selected.length > 0
}

function jsonValueToString(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}

function jsonJoinArray(value: string, path: string, separator: string): string | null {
  const tokens = parseJsonPath(path)
  if (tokens === null) return null

  try {
    const selected = selectJsonPathValues(JSON.parse(value) as unknown, tokens)
    const values =
      selected.length === 1 && Array.isArray(selected[0])
        ? (selected[0] as ReadonlyArray<unknown>)
        : selected
    return values.map((item) => jsonValueToString(item)).join(separator)
  } catch {
    return null
  }
}

function applyCardigannKeywordFilter(
  value: string,
  filter: CardigannFilter,
  variables: Record<string, TemplateValue>,
): string {
  const [first = "", second = ""] = filter.args

  switch (filter.name) {
    case "append":
      return `${value}${renderTemplate(first, variables)}`
    case "htmldecode":
      return htmlDecode(value)
    case "htmlencode":
      return htmlEncode(value)
    case "dateparse":
    case "timeparse":
      return first ? (parseDotNetDate(value, first)?.toUTCString() ?? value) : value
    case "reltime":
    case "timeago":
      return relativeTimeDate(value)?.toUTCString() ?? value
    case "diacritics":
      return first === "replace" ? stripDiacritics(value) : value
    case "fuzzytime":
      return parseFuzzyDate(value)?.toUTCString() ?? value
    case "jsonjoinarray":
      return first
        ? (jsonJoinArray(
            value,
            renderTemplate(first, variables),
            renderTemplate(second, variables),
          ) ?? value)
        : value
    case "prepend":
      return `${renderTemplate(first, variables)}${value}`
    case "querystring":
      return queryStringValue(value, renderTemplate(first, variables))
    case "re_replace":
      return first
        ? value.replace(new RegExp(first, "g"), renderTemplate(second, variables))
        : value
    case "regexp": {
      if (!first) return value
      const match = new RegExp(first).exec(value)
      return match?.[1] ?? match?.[0] ?? ""
    }
    case "replace":
      return first ? value.split(first).join(renderTemplate(second, variables)) : value
    case "split":
      return splitFilterValue(
        value,
        renderTemplate(first, variables),
        renderTemplate(second, variables),
      )
    case "tolower":
    case "lower":
    case "lowercase":
      return value.toLowerCase()
    case "toupper":
    case "upper":
    case "uppercase":
      return value.toUpperCase()
    case "trim":
      return first ? trimCharacters(value, first) : value.trim()
    case "validate":
      return validatedTerms(value, renderTemplate(first, variables))
    case "urldecode":
    case "urldecodecomponent":
      return urlDecode(value)
    case "queryescape":
    case "urlencode":
    case "urlencodecomponent":
      return encodeURIComponent(value)
    case "validfilename":
      return validFilename(value)
    default:
      return value
  }
}

function applyCardigannKeywordFilters(
  value: string,
  filters: ReadonlyArray<CardigannFilter>,
  variables: Record<string, TemplateValue>,
): string {
  return filters.reduce(
    (current, filter) => applyCardigannKeywordFilter(current, filter, variables),
    value,
  )
}

function normalizeUrlSearchParamValue(value: string): string {
  if (!/%[\dA-Fa-f]{2}/.test(value)) return value
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function appendRawParams(params: URLSearchParams, raw: string): void {
  for (const part of raw.split("&")) {
    if (part.length === 0) continue
    const [key, value = ""] = part.split("=", 2)
    if (key.length > 0) {
      params.append(normalizeUrlSearchParamValue(key), normalizeUrlSearchParamValue(value))
    }
  }
}

function appendInputs(
  params: URLSearchParams,
  inputs: Readonly<Record<string, string>>,
  variables: Record<string, TemplateValue>,
  allowEmptyInputs: boolean,
): void {
  for (const [key, template] of Object.entries(inputs)) {
    const value = renderTemplate(template, variables)
    if (value.length === 0 && !allowEmptyInputs) continue

    if (key === "$raw") {
      appendRawParams(params, value)
    } else {
      params.append(key, normalizeUrlSearchParamValue(value))
    }
  }
}

function appendHeaders(
  headers: Headers,
  inputs: Readonly<Record<string, string>>,
  variables: Record<string, TemplateValue>,
  allowEmptyInputs: boolean,
): void {
  for (const [key, template] of Object.entries(inputs)) {
    const value = renderTemplate(template, variables)
    if (value.length === 0 && !allowEmptyInputs) continue
    headers.set(key, value)
  }
}

function applyCardigannFieldFilters(
  value: string,
  filters: ReadonlyArray<CardigannFilter>,
  variables: Record<string, TemplateValue>,
): string {
  return filters.reduce(
    (current, filter) => applyCardigannKeywordFilter(current, filter, variables),
    value,
  )
}

function applyCardigannPreprocessingFilters(
  text: string,
  definition: CardigannRuntimeDefinition,
  variables: Record<string, TemplateValue>,
): string {
  return applyCardigannFieldFilters(text, definition.search.preprocessingFilters, variables)
}

function matchesNoResultsMessage(text: string, noResultsMessage: string | undefined): boolean {
  if (noResultsMessage === undefined) return false
  return noResultsMessage.length > 0 ? text.includes(noResultsMessage) : text.trim().length === 0
}

function htmlSelectorSteps(selector: string): ReadonlyArray<HtmlSelectorStep> {
  const steps: Array<HtmlSelectorStep> = []
  let current = ""
  let bracketDepth = 0
  let parenDepth = 0
  let quote: string | null = null
  let nextDirect = false

  const pushStep = () => {
    const token = current.trim()
    current = ""
    if (token.length === 0) return
    steps.push({
      token,
      direct: nextDirect,
    })
    nextDirect = false
  }

  for (const char of selector.trim()) {
    if ((char === `"` || char === `'`) && (bracketDepth > 0 || parenDepth > 0)) {
      quote = quote === char ? null : (quote ?? char)
    } else if (quote === null && char === "[") {
      bracketDepth += 1
    } else if (quote === null && char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1)
    } else if (quote === null && char === "(") {
      parenDepth += 1
    } else if (quote === null && char === ")") {
      parenDepth = Math.max(0, parenDepth - 1)
    }

    if (quote === null && bracketDepth === 0 && parenDepth === 0 && char === ">") {
      pushStep()
      nextDirect = true
    } else if (quote === null && bracketDepth === 0 && parenDepth === 0 && /\s/.test(char)) {
      pushStep()
    } else {
      current += char
    }
  }

  pushStep()
  return steps
}

function simpleSelectorTokens(selector: string): ReadonlyArray<string> {
  return htmlSelectorSteps(selector).map((step) => step.token)
}

function splitHtmlSelectorList(selector: string): ReadonlyArray<string> {
  const selectors: Array<string> = []
  let current = ""
  let bracketDepth = 0
  let parenDepth = 0
  let quote: string | null = null

  for (const char of selector.trim()) {
    if ((char === `"` || char === `'`) && (bracketDepth > 0 || parenDepth > 0)) {
      quote = quote === char ? null : (quote ?? char)
    } else if (quote === null && char === "[") {
      bracketDepth += 1
    } else if (quote === null && char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1)
    } else if (quote === null && char === "(") {
      parenDepth += 1
    } else if (quote === null && char === ")") {
      parenDepth = Math.max(0, parenDepth - 1)
    }

    if (quote === null && bracketDepth === 0 && parenDepth === 0 && char === ",") {
      const selected = current.trim()
      if (selected.length > 0) selectors.push(selected)
      current = ""
    } else {
      current += char
    }
  }

  const selected = current.trim()
  if (selected.length > 0) selectors.push(selected)
  return selectors
}

function htmlSelectorFilterStart(text: string): number {
  let bracketDepth = 0
  let quote: string | null = null

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ""
    if ((char === `"` || char === "'") && bracketDepth > 0) {
      quote = quote === char ? null : (quote ?? char)
    } else if (quote === null && char === "[") {
      bracketDepth += 1
    } else if (quote === null && char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1)
    } else if (quote === null && bracketDepth === 0 && char === ":") {
      return index
    }
  }

  return -1
}

function parseSimpleHtmlSelectorToken(token: string): SimpleHtmlSelector | null {
  if (token.length === 0) return null

  const filterStart = htmlSelectorFilterStart(token)
  const baseToken = filterStart < 0 ? token : token.slice(0, filterStart)
  const filters = filterStart < 0 ? [] : parseHtmlSelectorFilters(token.slice(filterStart))
  if (filters === null) return null

  const tagMatch = baseToken.match(/^[A-Za-z][\w:-]*/)
  const idMatch = baseToken.match(/#([\w-]+)/)
  const classes = Array.from(baseToken.matchAll(/\.([\w-]+)/g)).map((match) => match[1] ?? "")
  const attributes = Array.from(
    baseToken.matchAll(/\[([\w:-]+)(?:\s*([!~|*^$]?=)\s*["']?([^"'\]]*)["']?)?\]/g),
  ).map((match) => ({
    name: match[1] ?? "",
    operator: match[2] ?? null,
    value: match[3] ?? "",
  }))

  return {
    tag: tagMatch?.[0].toLowerCase() ?? null,
    id: idMatch?.[1] ?? null,
    classes,
    attributes,
    filters,
  }
}

function parseHtmlAttributes(value: string): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {}
  for (const match of value.matchAll(
    /([^\s"'<>/=]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
  )) {
    const name = (match[1] ?? "").toLowerCase()
    if (name.length === 0) continue
    attributes[name] = htmlDecode(match[3] ?? match[4] ?? match[5] ?? "")
  }
  return attributes
}

function findHtmlInputElements(html: string): ReadonlyArray<HtmlElementMatch> {
  return Array.from(html.matchAll(/<input\b([^>]*)>/gi)).map((match) => ({
    tagName: "input",
    attributes: parseHtmlAttributes(match[1] ?? ""),
    innerHtml: "",
    outerHtml: match[0],
  }))
}

function findHtmlInputElement(
  form: HtmlElementMatch,
  selectorText: string,
): HtmlElementMatch | undefined {
  const tokens = simpleSelectorTokens(selectorText)
  if (tokens.length === 0) return undefined
  if (tokens.length === 1) {
    return findHtmlInputElements(form.innerHtml).find((input) =>
      htmlElementSelfMatches(input, tokens[0] ?? ""),
    )
  }

  const containerSelector = tokens.slice(0, -1).join(" ")
  const container = selectHtmlFieldElement(form, containerSelector)
  if (container === undefined) return undefined

  const inputSelector = tokens[tokens.length - 1] ?? ""
  return findHtmlInputElements(container.innerHtml).find((input) =>
    htmlElementSelfMatches(input, inputSelector),
  )
}

function htmlAttributeMatches(
  attributes: Readonly<Record<string, string>>,
  selector: SimpleHtmlSelector,
): boolean {
  if (selector.id !== null && attributes.id !== selector.id) return false

  const classes = new Set((attributes.class ?? "").split(/\s+/).filter((item) => item.length > 0))
  if (selector.classes.some((className) => !classes.has(className))) return false

  return selector.attributes.every((attribute) => {
    const actual = attributes[attribute.name.toLowerCase()]
    if (actual === undefined) return attribute.operator === "!="
    if (attribute.operator === null) return true
    if (attribute.operator === "=") return actual === attribute.value
    if (attribute.operator === "!=") return actual !== attribute.value
    if (attribute.operator === "^=") return actual.startsWith(attribute.value)
    if (attribute.operator === "$=") return actual.endsWith(attribute.value)
    if (attribute.operator === "*=") return actual.includes(attribute.value)
    if (attribute.operator === "~=") return actual.split(/\s+/).includes(attribute.value)
    if (attribute.operator === "|=")
      return actual === attribute.value || actual.startsWith(`${attribute.value}-`)
    return false
  })
}

function unquotedHtmlSelectorFilterValue(value: string): string {
  const quote = value[0]
  return (quote === `"` || quote === "'") && value.endsWith(quote) ? value.slice(1, -1) : value
}

function htmlSelectorExists(element: HtmlElementMatch, selectorText: string): boolean {
  return (
    htmlElementSelfMatches(element, selectorText) ||
    findHtmlElements(element.innerHtml, selectorText).length > 0
  )
}

function isHtmlPositionalSelectorFilter(filter: JsonSelectorFilter): boolean {
  return (
    filter.name === "eq" ||
    filter.name === "first" ||
    filter.name === "last" ||
    filter.name === "even" ||
    filter.name === "odd" ||
    filter.name === "gt" ||
    filter.name === "lt"
  )
}

function htmlSelectorPositionIndex(filter: JsonSelectorFilter, length: number): number | null {
  if (filter.name === "first") return 0
  if (filter.name === "last") return length - 1
  if (filter.name !== "eq") return null

  const index = Number.parseInt(filter.selector, 10)
  if (!Number.isFinite(index)) return null
  return index < 0 ? length + index : index
}

function applyHtmlPositionalSelectorFilters(
  matches: ReadonlyArray<HtmlElementMatch>,
  filters: ReadonlyArray<JsonSelectorFilter>,
): ReadonlyArray<HtmlElementMatch> {
  return filters.reduce((current, filter) => {
    switch (filter.name) {
      case "eq":
      case "first":
      case "last": {
        const index = htmlSelectorPositionIndex(filter, current.length)
        const match = index !== null ? current[index] : undefined
        return match === undefined ? [] : [match]
      }
      case "even":
        return current.filter((_, index) => index % 2 === 0)
      case "odd":
        return current.filter((_, index) => index % 2 === 1)
      case "gt": {
        const index = Number.parseInt(filter.selector, 10)
        return Number.isFinite(index)
          ? current.filter((_, itemIndex) => itemIndex > index)
          : current
      }
      case "lt": {
        const index = Number.parseInt(filter.selector, 10)
        return Number.isFinite(index)
          ? current.filter((_, itemIndex) => itemIndex < index)
          : current
      }
      default:
        return current
    }
  }, matches)
}

function htmlSelectorFiltersMatch(
  element: HtmlElementMatch,
  filters: ReadonlyArray<JsonSelectorFilter>,
): boolean {
  return filters.every((filter) => {
    if (isHtmlPositionalSelectorFilter(filter)) return true
    switch (filter.name) {
      case "contains":
        return htmlTextContent(element.innerHtml).includes(
          unquotedHtmlSelectorFilterValue(filter.selector),
        )
      case "has":
        return findHtmlElements(element.innerHtml, filter.selector).length > 0
      case "not":
        return !htmlSelectorExists(element, filter.selector)
      case "checked":
        return Object.hasOwn(element.attributes, "checked")
      case "selected":
        return Object.hasOwn(element.attributes, "selected")
      case "disabled":
        return Object.hasOwn(element.attributes, "disabled")
      case "enabled":
        return !Object.hasOwn(element.attributes, "disabled")
      case "empty":
        return (
          htmlTextContent(element.innerHtml).length === 0 &&
          !/<[A-Za-z][\w:-]*/.test(element.innerHtml)
        )
      case "parent":
        return (
          htmlTextContent(element.innerHtml).length > 0 ||
          /<[A-Za-z][\w:-]*/.test(element.innerHtml)
        )
      case "first-child":
        return element.firstChild === true
      case "last-child":
        return element.lastChild === true
      case "nth-child":
        return htmlNthChildMatches(element.childIndex, filter.selector)
      default:
        return true
    }
  })
}

const HTML_VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
])

function isDirectHtmlChildAt(html: string, index: number): boolean {
  const stack: Array<string> = []
  for (const match of html.slice(0, index).matchAll(/<\/?([A-Za-z][\w:-]*)([^>]*)>/g)) {
    const raw = match[0]
    const tagName = (match[1] ?? "").toLowerCase()
    if (tagName.length === 0) continue

    if (raw.startsWith("</")) {
      const openIndex = stack.lastIndexOf(tagName)
      if (openIndex >= 0) stack.splice(openIndex)
      continue
    }

    const attributes = match[2] ?? ""
    if (
      raw.endsWith("/>") ||
      attributes.trimEnd().endsWith("/") ||
      HTML_VOID_ELEMENTS.has(tagName)
    ) {
      continue
    }

    stack.push(tagName)
  }

  return stack.length === 0
}

function htmlChildPositionAt(
  html: string,
  index: number,
): { readonly first: boolean; readonly last: boolean; readonly index: number | undefined } {
  let rootChildCount = 0
  let targetDepth = -1
  let targetFound = false
  let first = false
  let last = true
  let childIndex: number | undefined
  const stack: Array<{ tagName: string; childCount: number }> = []

  for (const match of html.matchAll(/<\/?([A-Za-z][\w:-]*)([^>]*)>/g)) {
    const raw = match[0]
    const tagName = (match[1] ?? "").toLowerCase()
    if (tagName.length === 0) continue

    if (raw.startsWith("</")) {
      const openIndex = stack.findLastIndex((frame) => frame.tagName === tagName)
      if (openIndex >= 0) stack.splice(openIndex)
      continue
    }

    const matchIndex = match.index ?? 0
    const depth = stack.length
    if (targetFound && matchIndex > index && depth === targetDepth) {
      last = false
      break
    }

    const parent = stack.at(-1)
    const priorChildCount = parent?.childCount ?? rootChildCount
    if (parent) {
      parent.childCount += 1
    } else {
      rootChildCount += 1
    }

    if (matchIndex === index) {
      targetFound = true
      targetDepth = depth
      first = priorChildCount === 0
      childIndex = priorChildCount + 1
    }

    const attributes = match[2] ?? ""
    if (
      raw.endsWith("/>") ||
      attributes.trimEnd().endsWith("/") ||
      HTML_VOID_ELEMENTS.has(tagName)
    ) {
      continue
    }

    stack.push({ tagName, childCount: 0 })
  }

  return targetFound
    ? { first, last, index: childIndex }
    : { first: false, last: false, index: undefined }
}

function htmlNthChildMatches(index: number | undefined, expression: string): boolean {
  if (index === undefined || index <= 0) return false

  const normalized = expression.toLowerCase().replace(/\s+/g, "")
  if (normalized.length === 0) return false
  if (normalized === "odd") return index % 2 === 1
  if (normalized === "even") return index % 2 === 0
  if (/^[+-]?\d+$/.test(normalized)) return index === Number.parseInt(normalized, 10)

  const match = normalized.match(/^([+-]?\d*)n(?:([+-]\d+))?$/)
  if (match === null) return false

  const coefficientText = match[1] ?? ""
  const coefficient =
    coefficientText === "" || coefficientText === "+"
      ? 1
      : coefficientText === "-"
        ? -1
        : Number.parseInt(coefficientText, 10)
  const offset = match[2] === undefined ? 0 : Number.parseInt(match[2], 10)
  if (!Number.isFinite(coefficient) || !Number.isFinite(offset)) return false
  if (coefficient === 0) return index === offset

  const delta = index - offset
  return delta % coefficient === 0 && delta / coefficient >= 0
}

function findHtmlElementsForToken(
  html: string,
  selectorText: string,
  baseIndex = 0,
  direct = false,
): ReadonlyArray<HtmlElementMatch> {
  const selector = parseSimpleHtmlSelectorToken(selectorText)
  if (selector === null) return []

  const tagPattern = selector.tag ? escapeRegExp(selector.tag) : "[A-Za-z][\\w:-]*"
  const elementPattern = new RegExp(`<(${tagPattern})\\b([^>]*)>([\\s\\S]*?)<\\/\\1>`, "gi")
  const matches: Array<HtmlElementMatch> = []
  const needsChildPosition = selector.filters.some(
    (filter) =>
      filter.name === "first-child" || filter.name === "last-child" || filter.name === "nth-child",
  )
  const pushMatch = (
    match: RegExpMatchArray,
    tagName: string,
    innerHtml: string,
    outerHtml: string,
  ) => {
    const matchIndex = match.index ?? 0
    if (direct && !isDirectHtmlChildAt(html, matchIndex)) return

    if (selector.tag !== null && tagName !== selector.tag) return

    const attributes = parseHtmlAttributes(match[2] ?? "")
    const sourceIndex = baseIndex + matchIndex
    const childPosition = needsChildPosition ? htmlChildPositionAt(html, matchIndex) : null
    const element = {
      tagName,
      attributes,
      innerHtml,
      outerHtml,
      sourceIndex,
      innerHtmlStartIndex: sourceIndex + outerHtml.indexOf(">") + 1,
      firstChild: childPosition?.first,
      lastChild: childPosition?.last,
      childIndex: childPosition?.index,
    }
    if (
      htmlAttributeMatches(attributes, selector) &&
      htmlSelectorFiltersMatch(element, selector.filters)
    ) {
      matches.push(element)
    }
  }

  for (const match of html.matchAll(elementPattern)) {
    pushMatch(match, (match[1] ?? "").toLowerCase(), match[3] ?? "", match[0])
  }

  const voidElementPattern = new RegExp(`<(${tagPattern})\\b([^>]*)\\/?>`, "gi")
  for (const match of html.matchAll(voidElementPattern)) {
    const tagName = (match[1] ?? "").toLowerCase()
    const outerHtml = match[0]
    if (!HTML_VOID_ELEMENTS.has(tagName) && !outerHtml.endsWith("/>")) continue
    pushMatch(match, tagName, "", outerHtml)
  }

  const orderedMatches = uniqueHtmlElementMatches(
    matches.toSorted((left, right) => htmlElementSourceIndex(left) - htmlElementSourceIndex(right)),
  )
  return applyHtmlPositionalSelectorFilters(orderedMatches, selector.filters)
}

function uniqueHtmlElementMatches(
  matches: ReadonlyArray<HtmlElementMatch>,
): ReadonlyArray<HtmlElementMatch> {
  const seen = new Set<string>()
  const unique: Array<HtmlElementMatch> = []
  for (const match of matches) {
    const key = `${match.sourceIndex ?? -1}:${match.outerHtml}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(match)
  }
  return unique
}

function htmlElementSourceIndex(match: HtmlElementMatch): number {
  return match.sourceIndex ?? Number.MAX_SAFE_INTEGER
}

function findHtmlElementsForSelector(
  html: string,
  selectorText: string,
): ReadonlyArray<HtmlElementMatch> {
  const steps = htmlSelectorSteps(selectorText)
  if (steps.length === 0) return []

  let matches: ReadonlyArray<HtmlElementMatch> = [
    { tagName: null, attributes: {}, innerHtml: html, outerHtml: html },
  ]
  for (const step of steps) {
    matches = matches.flatMap((match) =>
      findHtmlElementsForToken(
        match.innerHtml,
        step.token,
        match.innerHtmlStartIndex ?? 0,
        step.direct,
      ),
    )
    if (matches.length === 0) return []
  }
  return matches
}

function findHtmlElements(html: string, selectorText: string): ReadonlyArray<HtmlElementMatch> {
  const selectors = splitHtmlSelectorList(selectorText)
  if (selectors.length === 0) return []
  if (selectors.length === 1) return findHtmlElementsForSelector(html, selectors[0] ?? "")

  return uniqueHtmlElementMatches(
    selectors
      .flatMap((selector) => findHtmlElementsForSelector(html, selector))
      .toSorted((left, right) => htmlElementSourceIndex(left) - htmlElementSourceIndex(right)),
  )
}

function mergeHtmlRows(
  rows: ReadonlyArray<HtmlElementMatch>,
  before: number | undefined,
  after: number | undefined,
): ReadonlyArray<HtmlElementMatch> {
  const beforeCount = before ?? 0
  const afterCount = after ?? 0
  if (beforeCount <= 0 && afterCount <= 0) return rows

  const merged: Array<HtmlElementMatch> = []
  const groupSize = beforeCount + afterCount + 1
  for (let index = 0; index < rows.length; index += groupSize) {
    const rowIndex = index + beforeCount
    const row = rows[rowIndex]
    if (row === undefined) continue

    const precedingRows = rows.slice(index, rowIndex)
    const followingRows = rows.slice(rowIndex + 1, rowIndex + afterCount + 1)
    const mergedRows = [...precedingRows, row, ...followingRows]
    merged.push({
      tagName: row.tagName,
      attributes: row.attributes,
      innerHtml: mergedRows
        .map((mergedRow) => mergedRow.innerHtml)
        .filter((value) => value.length > 0)
        .join("\n"),
      outerHtml: mergedRows
        .map((mergedRow) => mergedRow.outerHtml)
        .filter((value) => value.length > 0)
        .join("\n"),
      sourceIndex: row.sourceIndex,
      innerHtmlStartIndex: row.innerHtmlStartIndex,
    })
  }

  return merged
}

function normalizedTextTokens(value: string): ReadonlyArray<string> {
  return (
    value
      .toLowerCase()
      .replaceAll(/['’]s\b/g, "")
      .match(/[a-z0-9]+/g) ?? []
  ).filter((token) => token.length > 1 || /\d/.test(token))
}

function rowAndMatchSearchText(
  filter: CardigannFilter,
  variables: Record<string, TemplateValue>,
): string {
  const searchText =
    templateValueToString(variables[".Keywords"]) ||
    templateValueToString(variables[".Query.Q"]) ||
    ""
  const maxLength = Number.parseInt(renderTemplate(filter.args[0] ?? "", variables), 10)
  return Number.isFinite(maxLength) && maxLength > 0 ? searchText.slice(0, maxLength) : searchText
}

function htmlRowFilterText(row: HtmlElementMatch): string {
  return `${htmlTextContent(row.innerHtml)} ${Object.values(row.attributes).join(" ")}`
}

function textMatchesAndMatch(
  value: string,
  filter: CardigannFilter,
  variables: Record<string, TemplateValue>,
): boolean {
  const terms = normalizedTextTokens(rowAndMatchSearchText(filter, variables))
  if (terms.length === 0) return true

  const rowTerms = new Set(normalizedTextTokens(value))
  return terms.every((term) => rowTerms.has(term))
}

function rowMatchesAndMatch(
  row: HtmlElementMatch,
  filter: CardigannFilter,
  variables: Record<string, TemplateValue>,
): boolean {
  return textMatchesAndMatch(htmlRowFilterText(row), filter, variables)
}

function rowMatchesCardigannFilter(
  row: HtmlElementMatch,
  filter: CardigannFilter,
  variables: Record<string, TemplateValue>,
): boolean {
  switch (filter.name) {
    case "andmatch":
      return rowMatchesAndMatch(row, filter, variables)
    case "hexdump":
    case "strdump":
      return true
    default:
      return true
  }
}

function filterHtmlRows(
  rows: ReadonlyArray<HtmlElementMatch>,
  filters: ReadonlyArray<CardigannFilter>,
  variables: Record<string, TemplateValue>,
): ReadonlyArray<HtmlElementMatch> {
  if (filters.length === 0) return rows
  return rows.filter((row) =>
    filters.every((filter) => rowMatchesCardigannFilter(row, filter, variables)),
  )
}

function jsonRowFilterText(row: unknown): string {
  try {
    return jsonValueToString(row)
  } catch {
    return ""
  }
}

function rowMatchesJsonCardigannFilter(
  row: unknown,
  filter: CardigannFilter,
  variables: Record<string, TemplateValue>,
): boolean {
  switch (filter.name) {
    case "andmatch":
      return textMatchesAndMatch(jsonRowFilterText(row), filter, variables)
    case "hexdump":
    case "strdump":
      return true
    default:
      return true
  }
}

function filterJsonRows(
  rows: ReadonlyArray<JsonRowMatch>,
  filters: ReadonlyArray<CardigannFilter>,
  variables: Record<string, TemplateValue>,
): ReadonlyArray<JsonRowMatch> {
  if (filters.length === 0) return rows
  return rows.filter((row) =>
    filters.every((filter) => rowMatchesJsonCardigannFilter(row.value, filter, variables)),
  )
}

function htmlDateHeaderValue(
  html: string,
  row: HtmlElementMatch,
  dateHeaders: CardigannFieldSelector,
  variables: Record<string, TemplateValue>,
): string {
  const rowIndex = row.sourceIndex ?? html.indexOf(row.outerHtml)
  if (rowIndex <= 0) return ""

  const precedingHtml = html.slice(0, rowIndex)
  if (row.tagName !== null) {
    const previousRows = findHtmlElements(precedingHtml, row.tagName)
    for (let index = previousRows.length - 1; index >= 0; index -= 1) {
      const previousRow = previousRows[index]
      if (previousRow === undefined) continue
      const value = htmlFieldValue(previousRow, dateHeaders, variables)
      if (value.length > 0) return value
    }
  }

  if (dateHeaders.selector === undefined) return ""
  const headerSelector = renderTemplate(dateHeaders.selector, variables)

  const { selector: _selector, ...headerField } = dateHeaders
  const headerElements = findHtmlElements(precedingHtml, headerSelector)
  for (let index = headerElements.length - 1; index >= 0; index -= 1) {
    const headerElement = headerElements[index]
    if (headerElement === undefined) continue
    const value = htmlFieldValue(headerElement, headerField, variables)
    if (value.length > 0) return value
  }

  return ""
}

function removeHtmlElements(html: string, selectorText: string): string {
  return findHtmlElements(html, selectorText).reduce(
    (current, match) => current.split(match.outerHtml).join(""),
    html,
  )
}

function htmlElementSelfMatches(element: HtmlElementMatch, selectorText: string): boolean {
  const selectors = splitHtmlSelectorList(selectorText)
  if (selectors.length > 1) {
    return selectors.some((selector) => htmlElementSelfMatches(element, selector))
  }

  const steps = htmlSelectorSteps(selectorText)
  if (steps.length !== 1 || steps[0]?.direct === true) return false

  const selector = parseSimpleHtmlSelectorToken(steps[0]?.token ?? "")
  if (selector === null) return false
  if (selector.filters.some(isHtmlPositionalSelectorFilter)) return false
  if (selector.tag !== null && element.tagName !== selector.tag) return false
  return (
    htmlAttributeMatches(element.attributes, selector) &&
    htmlSelectorFiltersMatch(element, selector.filters)
  )
}

function htmlCaseValue(
  element: HtmlElementMatch,
  innerHtml: string,
  cases: Readonly<Record<string, string>> | undefined,
  variables: Record<string, TemplateValue>,
): string | null {
  if (cases === undefined) return null

  for (const [selector, template] of Object.entries(cases)) {
    if (
      htmlElementSelfMatches(element, selector) ||
      findHtmlElements(innerHtml, selector).length > 0
    ) {
      return renderTemplate(template, variables)
    }
  }

  return null
}

function selectHtmlFieldElement(
  row: HtmlElementMatch,
  selector: string,
): HtmlElementMatch | undefined {
  if (htmlElementSelfMatches(row, selector)) return row
  return (
    findHtmlElements(row.innerHtml, selector)[0] ??
    findHtmlInputElements(row.innerHtml).find((input) => htmlElementSelfMatches(input, selector))
  )
}

function htmlTextContent(value: string): string {
  return htmlDecode(
    value
      .replaceAll(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replaceAll(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replaceAll(/<[^>]+>/g, " ")
      .replaceAll(/\s+/g, " ")
      .trim(),
  )
}

function htmlFieldValue(
  row: HtmlElementMatch,
  field: CardigannFieldSelector,
  variables: Record<string, TemplateValue>,
): string {
  const selected = field.selector
    ? selectHtmlFieldElement(row, renderTemplate(field.selector, variables))
    : row
  let value = ""
  if (field.text !== undefined) {
    value = renderTemplate(field.text, variables)
  } else if (selected) {
    const selectedInnerHtml =
      field.remove !== undefined
        ? removeHtmlElements(selected.innerHtml, renderTemplate(field.remove, variables))
        : selected.innerHtml
    value =
      htmlCaseValue(selected, selectedInnerHtml, field.case, variables) ??
      (field.attribute
        ? (selected.attributes[field.attribute.toLowerCase()] ?? "")
        : htmlTextContent(selectedInnerHtml))
  }

  if (value.trim().length === 0 && field.defaultValue !== undefined) {
    value = renderTemplate(field.defaultValue, variables)
  }

  return applyCardigannFieldFilters(value.trim(), field.filters, variables).trim()
}

function jsonSelectionToFieldString(values: ReadonlyArray<unknown>): string {
  const selected =
    values.length === 1 && Array.isArray(values[0]) ? (values[0] as ReadonlyArray<unknown>) : values
  return selected.map((item) => jsonValueToString(item)).join(",")
}

function jsonCaseValue(
  value: string,
  cases: Readonly<Record<string, string>> | undefined,
  variables: Record<string, TemplateValue>,
): string {
  if (cases === undefined) return value

  for (const [expected, template] of Object.entries(cases)) {
    if (expected === "*" || value === expected) return renderTemplate(template, variables)
  }

  return value
}

function jsonFieldValue(
  row: unknown,
  field: CardigannFieldSelector,
  variables: Record<string, TemplateValue>,
  parent: unknown = row,
): string {
  let value = ""
  if (field.text !== undefined) {
    value = renderTemplate(field.text, variables)
  } else if (field.selector !== undefined) {
    const rawSelector = renderTemplate(field.selector, variables).trim()
    const selected = selectJsonSelectorValues(
      rawSelector.startsWith("..") ? parent : row,
      rawSelector.replace(/^\.+/, ""),
    )
    if (selected !== null) value = jsonSelectionToFieldString(selected)
  }

  value = jsonCaseValue(value, field.case, variables)

  if (value.trim().length === 0 && field.defaultValue !== undefined) {
    value = renderTemplate(field.defaultValue, variables)
  }

  return applyCardigannFieldFilters(value.trim(), field.filters, variables).trim()
}

function htmlDocumentMatch(html: string): HtmlElementMatch {
  return {
    tagName: null,
    attributes: {},
    innerHtml: html,
    outerHtml: html,
    sourceIndex: 0,
    innerHtmlStartIndex: 0,
  }
}

function fieldByName(
  fields: Readonly<Record<string, string>>,
  names: ReadonlyArray<string>,
): string {
  const lowerFields = new Map(
    Object.entries(fields).map(([key, value]) => [key.toLowerCase(), value]),
  )
  for (const name of names) {
    const value = fields[name] ?? lowerFields.get(name.toLowerCase())
    if (value && value.length > 0) return value
  }
  return ""
}

function cardigannFieldNameParts(rawName: string): {
  readonly name: string
  readonly modifiers: ReadonlySet<string>
} {
  const [name, ...modifiers] = rawName.split("|").map((part) => part.trim())
  return {
    name: name && name.length > 0 ? name : rawName,
    modifiers: new Set(modifiers.map((modifier) => modifier.toLowerCase())),
  }
}

function assignCardigannResultField(
  fields: Record<string, string>,
  name: string,
  value: string,
  modifiers: ReadonlySet<string>,
): string {
  if (modifiers.has("append")) {
    fields[name] = `${fields[name] ?? ""}${value}`
  } else {
    fields[name] = value
  }
  return fields[name] ?? ""
}

function shouldAssignCardigannResultField(
  fields: Readonly<Record<string, string>>,
  name: string,
  value: string,
  field: CardigannFieldSelector,
  modifiers: ReadonlySet<string>,
): boolean {
  return (
    value.length > 0 ||
    (field.optional !== true && !modifiers.has("optional")) ||
    fields[name] === undefined
  )
}

function firstNumber(value: string): number {
  const match = value.replaceAll(",", "").match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}

function parseHtmlDate(value: string): Date {
  const date = value.length > 0 ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function parseSizeBytes(value: string): number {
  const match = value.trim().match(/([\d.,]+)\s*([kmgtp]?i?b|[kmgtp]?b|bytes?)?/i)
  if (!match) return 0

  const rawAmount = match[1] ?? ""
  const amountText =
    rawAmount.includes(",") && rawAmount.includes(".")
      ? rawAmount.replaceAll(",", "")
      : rawAmount.replace(",", ".")
  const amount = Number(amountText)
  if (!Number.isFinite(amount)) return 0

  const unit = (match[2] ?? "b").toLowerCase()
  const factor =
    unit === "kb"
      ? 1_000
      : unit === "kib"
        ? 1_024
        : unit === "mb"
          ? 1_000_000
          : unit === "mib"
            ? 1_048_576
            : unit === "gb"
              ? 1_000_000_000
              : unit === "gib"
                ? 1_073_741_824
                : unit === "tb"
                  ? 1_000_000_000_000
                  : unit === "tib"
                    ? 1_099_511_627_776
                    : 1
  return Math.max(0, Math.round(amount * factor))
}

function releaseCategory(definition: CardigannRuntimeDefinition, trackerCategory: string): string {
  const trimmed = trackerCategory.trim()
  const mapping = definition.categories.find(
    (category) =>
      category.trackerCategory === trimmed ||
      category.trackerCategoryDesc === trimmed ||
      String(category.newznabCategory) === trimmed,
  )
  return mapping ? String(mapping.newznabCategory) : trimmed
}

function numberFieldOrDefault(value: string, defaultValue: number): number {
  const trimmed = value.trim()
  if (trimmed.length === 0) return defaultValue

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : defaultValue
}

function releaseFromResultFields(
  resultFields: Readonly<Record<string, string>>,
  dateValue: string,
  request: CardigannSearchRequest,
  definition: CardigannRuntimeDefinition,
  config: IndexerConfig,
  now: number,
): ReleaseCandidate {
  const publishedAt = parseHtmlDate(dateValue)
  const ageDays = Math.max(0, Math.floor((now - publishedAt.getTime()) / 86_400_000))
  const downloadUrl = absoluteUrl(
    fieldByName(resultFields, ["download", "downloadurl", "magnet", "link"]),
    request.url,
  )
  const infoUrl = fieldByName(resultFields, ["details", "info", "comments", "guid"])

  return {
    title: fieldByName(resultFields, ["title"]),
    indexerId: config.id,
    indexerName: config.name,
    indexerPriority: config.priority,
    size: parseSizeBytes(fieldByName(resultFields, ["size"])),
    seeders:
      definition.protocol === "torrent"
        ? firstNumber(fieldByName(resultFields, ["seeders", "seeds"]))
        : null,
    leechers:
      definition.protocol === "torrent"
        ? firstNumber(fieldByName(resultFields, ["leechers", "peers"]))
        : null,
    age: ageDays,
    downloadUrl,
    infoUrl: infoUrl.length > 0 ? absoluteUrl(infoUrl, request.url) : null,
    category: releaseCategory(definition, fieldByName(resultFields, ["category", "categorydesc"])),
    protocol: definition.protocol,
    publishedAt,
    infohash: fieldByName(resultFields, ["infohash"]).trim() || null,
    downloadFactor: numberFieldOrDefault(fieldByName(resultFields, ["downloadvolumefactor"]), 1),
    uploadFactor: numberFieldOrDefault(fieldByName(resultFields, ["uploadvolumefactor"]), 1),
  }
}

function absoluteUrl(value: string, baseUrl: URL): string {
  if (value.trim().length === 0) return ""
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return value
  }
}

function parseHtmlReleases(
  html: string,
  request: CardigannSearchRequest,
  definition: CardigannRuntimeDefinition,
  config: IndexerConfig,
): ReadonlyArray<ReleaseCandidate> {
  const rowSelector = definition.search.rows
  if (rowSelector === null) return []

  const rowSelectorText = renderTemplate(rowSelector.selector, request.variables)
  const rows = mergeHtmlRows(
    findHtmlElements(html, rowSelectorText),
    rowSelector.before,
    rowSelector.after,
  )
  const filteredRows = filterHtmlRows(rows, rowSelector.filters, request.variables)
  const now = Date.now()

  return filteredRows.map((row): ReleaseCandidate => {
    const resultFields: Record<string, string> = {}
    const variables = { ...request.variables }
    for (const [rawName, field] of Object.entries(definition.search.fields)) {
      const { name, modifiers } = cardigannFieldNameParts(rawName)
      const value = htmlFieldValue(row, field, variables)
      if (!shouldAssignCardigannResultField(resultFields, name, value, field, modifiers)) {
        continue
      }
      variables[`.Result.${name}`] = assignCardigannResultField(
        resultFields,
        name,
        value,
        modifiers,
      )
    }

    let dateValue = fieldByName(resultFields, ["date", "pubdate", "publishdate"])
    if (dateValue.length === 0 && rowSelector.dateHeaders !== undefined) {
      dateValue = htmlDateHeaderValue(html, row, rowSelector.dateHeaders, variables)
      if (dateValue.length > 0) {
        resultFields.date = dateValue
        variables[".Result.date"] = dateValue
      }
    }

    return releaseFromResultFields(resultFields, dateValue, request, definition, config, now)
  })
}

function parseJsonRows(
  json: unknown,
  rows: CardigannRowsSelector,
  variables: Record<string, TemplateValue>,
): ReadonlyArray<JsonRowMatch> {
  const selectorText = renderTemplate(rows.selector, variables)
  const selectorList = splitJsonSelectorList(selectorText)
  if (selectorList.length === 0)
    throw new Error(`Invalid Cardigann JSON rows selector: ${rows.selector}`)

  const filteredRows = selectorList.flatMap((selectorItem): ReadonlyArray<unknown> => {
    const selector = parseJsonSelector(selectorItem)
    if (selector === null) throw new Error(`Invalid Cardigann JSON rows selector: ${rows.selector}`)

    const tokens = parseJsonPath(selector.path)
    if (tokens === null) throw new Error(`Invalid Cardigann JSON rows selector: ${rows.selector}`)

    const selected = selectJsonPathValues(json, tokens)
    const selectedRows =
      selected.length === 1 && Array.isArray(selected[0])
        ? (selected[0] as ReadonlyArray<unknown>)
        : selected
    return selector.filters.length === 0
      ? selectedRows
      : applyJsonSelectorFilters(selectedRows, selector.filters)
  })

  if (filteredRows.length === 0) {
    if (rows.missingAttributeEqualsNoResults === true) return []
    throw new Error(`Cardigann JSON rows selector returned no results: ${rows.selector}`)
  }

  const attributeRows: ReadonlyArray<JsonRowMatch> =
    rows.attribute === undefined
      ? filteredRows.map((row) => ({ value: row, parent: row }))
      : filteredRows.flatMap((row) =>
          jsonRowAttributeValues(row, rows, variables).map((value) => ({
            value,
            parent: row,
          })),
        )
  if (rows.multiple === true) {
    return attributeRows.flatMap((row) =>
      jsonMultipleRowValues(row.value).map((value) => ({
        value,
        parent: row.parent,
      })),
    )
  }
  return attributeRows
}

function jsonRowAttributeValues(
  row: unknown,
  rows: CardigannRowsSelector,
  variables: Record<string, TemplateValue>,
): ReadonlyArray<unknown> {
  const attribute = rows.attribute
  if (attribute === undefined) return [row]

  const selected = selectJsonSelectorValues(row, renderTemplate(attribute, variables))
  if (selected === null)
    throw new Error(`Invalid Cardigann JSON row attribute selector: ${attribute}`)
  if (selected.length === 0) {
    if (rows.missingAttributeEqualsNoResults === true) return []
    throw new Error(`Cardigann JSON row attribute selector returned no results: ${attribute}`)
  }

  return selected
}

function jsonMultipleRowValues(row: unknown): ReadonlyArray<unknown> {
  if (Array.isArray(row)) return row
  if (isJsonRecord(row)) return Object.values(row)
  return []
}

function jsonRowsCountIsEmpty(
  json: unknown,
  rows: CardigannRowsSelector,
  variables: Record<string, TemplateValue>,
): boolean {
  if (rows.count === undefined) return false

  const count = Number.parseInt(jsonFieldValue(json, rows.count, variables).replaceAll(",", ""), 10)
  return Number.isFinite(count) && count < 1
}

function parseJsonReleases(
  text: string,
  request: CardigannSearchRequest,
  definition: CardigannRuntimeDefinition,
  config: IndexerConfig,
): ReadonlyArray<ReleaseCandidate> {
  const rowSelector = definition.search.rows
  if (rowSelector === null) return []

  const json = JSON.parse(text) as unknown
  if (jsonRowsCountIsEmpty(json, rowSelector, request.variables)) return []

  const rows = filterJsonRows(
    parseJsonRows(json, rowSelector, request.variables),
    rowSelector.filters,
    request.variables,
  )
  const now = Date.now()

  return rows.map((row): ReleaseCandidate => {
    const resultFields: Record<string, string> = {}
    const variables = { ...request.variables }
    for (const [rawName, field] of Object.entries(definition.search.fields)) {
      const { name, modifiers } = cardigannFieldNameParts(rawName)
      const value = jsonFieldValue(row.value, field, variables, row.parent)
      if (!shouldAssignCardigannResultField(resultFields, name, value, field, modifiers)) {
        continue
      }
      variables[`.Result.${name}`] = assignCardigannResultField(
        resultFields,
        name,
        value,
        modifiers,
      )
    }

    const dateValue = fieldByName(resultFields, ["date", "pubdate", "publishdate"])
    return releaseFromResultFields(resultFields, dateValue, request, definition, config, now)
  })
}

function splitSetCookieHeader(value: string): ReadonlyArray<string> {
  return value
    .split(/,(?=\s*[^;,=\s]+=)/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function setCookieHeaderValues(headers: Headers): ReadonlyArray<string> {
  const withGetter = headers as Headers & { getSetCookie?: () => Array<string> }
  if (typeof withGetter.getSetCookie === "function") return withGetter.getSetCookie()

  const header = headers.get("set-cookie")
  return header ? splitSetCookieHeader(header) : []
}

function cookiePairsFromHeaders(headers: Headers): ReadonlyArray<string> {
  return setCookieHeaderValues(headers)
    .map((cookie) => cookie.split(";", 1)[0]?.trim() ?? "")
    .filter((cookie) => cookie.length > 0 && cookie.includes("="))
}

function cookiePairsFromCookieHeader(value: string): ReadonlyArray<string> {
  return value
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.length > 0 && cookie.includes("="))
}

function addCookiePair(jar: Map<string, string>, cookie: string): void {
  const separator = cookie.indexOf("=")
  if (separator <= 0) return
  const name = cookie.slice(0, separator).trim()
  if (name.length > 0) jar.set(name, cookie)
}

function cookieJarValues(jar: ReadonlyMap<string, string>): ReadonlyArray<string> {
  return Array.from(jar.values())
}

function addCookieHeaderValue(jar: Map<string, string>, value: string): void {
  for (const cookie of cookiePairsFromCookieHeader(value)) {
    addCookiePair(jar, cookie)
  }
}

function withCookieHeader(init: RequestInit, cookies: ReadonlyArray<string>): RequestInit {
  if (cookies.length === 0) return init

  const headers = new Headers(init.headers)
  const existingCookie = headers.get("cookie")
  const cookieHeader =
    existingCookie && existingCookie.trim().length > 0
      ? `${existingCookie}; ${cookies.join("; ")}`
      : cookies.join("; ")
  headers.set("cookie", cookieHeader)
  return { ...init, headers }
}

function loginErrorMessage(
  html: string,
  error: CardigannLoginError,
  variables: Record<string, TemplateValue>,
): string | null {
  const selectorMatch =
    error.selector !== undefined ? findHtmlElements(html, error.selector)[0] : undefined
  if (error.selector !== undefined && selectorMatch === undefined) return null

  if (error.message !== undefined) {
    const messageMatch = error.message.selector
      ? findHtmlElements(html, error.message.selector)[0]
      : (selectorMatch ?? htmlDocumentMatch(html))
    if (messageMatch === undefined) return null

    const message = htmlFieldValue(messageMatch, error.message, variables).trim()
    return message.length > 0 ? message : "Cardigann login failed"
  }

  const message = selectorMatch ? htmlTextContent(selectorMatch.innerHtml) : ""
  return message.length > 0 ? message : "Cardigann login failed"
}

function loginTestFailureMessage(html: string, login: CardigannLoginRuntime | null): string | null {
  const test = login?.test
  if (test === undefined) return null
  if (findHtmlElements(html, test.selector).length > 0) return null
  return `Cardigann login test failed: selector not found: ${test.selector}`
}

function resolveLoginRequests(
  config: IndexerConfig,
  definition: CardigannRuntimeDefinition,
  baseUrl: string,
): ReadonlyArray<CardigannLoginRequest> {
  if (definition.login === null) return []
  if (definition.login.method === "cookie") return []

  const variables = configTemplateVariables(config, baseUrl, definition.authFields)
  const requests: Array<CardigannLoginRequest> = []
  for (const path of definition.login.paths) {
    const renderedPath =
      definition.login.method === "oneurl"
        ? `${renderTemplate(path.path, variables)}${renderTemplate(
            path.inputs.oneurl ?? definition.login.inputs.oneurl ?? "",
            variables,
          )}`
        : renderTemplate(path.path, variables)
    const url = new URL(renderedPath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)
    const targetParams = path.method === "get" ? url.searchParams : new URLSearchParams()
    const headers = new Headers()
    if (definition.login.method !== "oneurl") {
      appendInputs(targetParams, definition.login.inputs, variables, false)
      appendInputs(targetParams, path.inputs, variables, false)
    }
    appendHeaders(headers, definition.login.headers, variables, false)
    appendHeaders(headers, path.headers, variables, false)

    const init: RequestInit = {}
    if (path.method === "post") {
      init.method = "POST"
      init.body = targetParams
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/x-www-form-urlencoded")
      }
    }
    if (Array.from(headers).length > 0) init.headers = headers
    requests.push({ url, init })
  }

  return requests
}

function loginHeaders(
  login: CardigannLoginRuntime,
  path: CardigannLoginRuntime["paths"][number],
  variables: Record<string, TemplateValue>,
): Headers {
  const headers = new Headers()
  appendHeaders(headers, login.headers, variables, false)
  appendHeaders(headers, path.headers, variables, false)
  return headers
}

function selectorInputValue(
  document: HtmlElementMatch,
  inputName: string,
  field: CardigannFieldSelector,
  variables: Record<string, TemplateValue>,
): { readonly value?: string; readonly error?: string } {
  const value = htmlFieldValue(document, field, variables)
  if (value.length > 0 || field.defaultValue !== undefined) return { value }
  if (field.optional) return {}

  return { error: `Cardigann login failed: selector input not found: ${inputName}` }
}

function resolveConfiguredFormInputName(
  document: HtmlElementMatch,
  form: HtmlElementMatch,
  login: CardigannLoginRuntime,
  key: string,
): string | null {
  if (key === "$raw") return key
  if (login.selectors !== true) return key

  const input = findHtmlInputElement(form, key) ?? findHtmlInputElement(document, key)
  return input?.attributes.name ?? null
}

function captchaTemplateValue(variables: Record<string, TemplateValue>): string {
  for (const key of [
    ".Config.CAPTCHA",
    ".Config.Captcha",
    ".Config.captcha",
    ".Config.cardigannCaptcha",
    ".Config.CardigannCaptcha",
    ".Config.cardiganncaptcha",
    ".Config.CARDIGANNCAPTCHA",
  ]) {
    const value = templateValueToString(variables[key]).trim()
    if (value.length > 0) return value
  }
  return ""
}

function appendCaptchaFormParam(
  document: HtmlElementMatch,
  form: HtmlElementMatch,
  login: CardigannLoginRuntime,
  variables: Record<string, TemplateValue>,
  params: URLSearchParams,
): string | null {
  const captcha = login.captcha
  if (captcha === undefined) return null

  const value = captchaTemplateValue(variables)
  if (value.length === 0) return null

  const input = captcha.input
  if (input === undefined || input.length === 0) {
    return "Cardigann login failed: captcha input is not configured"
  }

  const inputName = resolveConfiguredFormInputName(document, form, login, input)
  if (inputName === null) {
    return `Cardigann login failed: captcha input selector not found: ${input}`
  }

  params.set(inputName, value)
  return null
}

function formParamsFromHtml(
  document: HtmlElementMatch,
  form: HtmlElementMatch,
  login: CardigannLoginRuntime,
  variables: Record<string, TemplateValue>,
): FormLoginParams | string {
  const params = new URLSearchParams()
  for (const input of findHtmlInputElements(form.innerHtml)) {
    const name = input.attributes.name
    if (name === undefined || name.length === 0 || input.attributes.disabled !== undefined) continue

    const type = (input.attributes.type ?? "").toLowerCase()
    if ((type === "checkbox" || type === "radio") && input.attributes.checked === undefined) {
      continue
    }

    params.set(name, input.attributes.value ?? "")
  }

  for (const [key, template] of Object.entries(login.inputs)) {
    const value = renderTemplate(template, variables)
    if (value.length === 0) continue

    const inputName = resolveConfiguredFormInputName(document, form, login, key)
    if (inputName === null) return `Cardigann login failed: form input selector not found: ${key}`

    if (inputName === "$raw") {
      appendRawParams(params, value)
    } else {
      params.set(inputName, normalizeUrlSearchParamValue(value))
    }
  }

  for (const [key, field] of Object.entries(login.selectorInputs ?? {})) {
    const result = selectorInputValue(document, key, field, variables)
    if (result.error !== undefined) return result.error
    if (result.value !== undefined) params.set(key, result.value)
  }

  const queryParams = new URLSearchParams()
  for (const [key, field] of Object.entries(login.getSelectorInputs ?? {})) {
    const result = selectorInputValue(document, key, field, variables)
    if (result.error !== undefined) return result.error
    if (result.value !== undefined) queryParams.set(key, result.value)
  }

  const captchaError = appendCaptchaFormParam(document, form, login, variables, params)
  if (captchaError !== null) return captchaError

  return { params, queryParams }
}

function multipartBoundary(params: URLSearchParams): string {
  let boundary = "----arrhub-cardigann-form-boundary"
  const values = Array.from(params.entries()).flat().join("\n")
  let suffix = 1
  while (values.includes(boundary)) {
    boundary = `----arrhub-cardigann-form-boundary-${suffix}`
    suffix += 1
  }
  return boundary
}

function escapeMultipartName(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll(/[\r\n]/g, " ")
}

function multipartFormBody(params: URLSearchParams): {
  readonly body: string
  readonly contentType: string
} {
  const boundary = multipartBoundary(params)
  const parts = Array.from(params.entries()).map(
    ([key, value]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${escapeMultipartName(key)}"\r\n\r\n${value}`,
  )
  parts.push(`--${boundary}--`)

  return {
    body: parts.join("\r\n"),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

function isMultipartForm(form: HtmlElementMatch): boolean {
  return (
    (form.attributes.enctype ?? "").split(";", 1)[0]?.trim().toLowerCase() === "multipart/form-data"
  )
}

function resolveFormSubmitUrl(
  landingUrl: URL,
  form: HtmlElementMatch,
  login: CardigannLoginRuntime,
  variables: Record<string, TemplateValue>,
): URL {
  const submitPath = login.submitPath ?? form.attributes.action ?? landingUrl.toString()
  return new URL(renderTemplate(submitPath, variables), landingUrl)
}

function hasSimpleCaptcha(html: string): boolean {
  return /<script\b[^>]*\bsrc\s*=\s*["'][^"']*simpleCaptcha[^"']*["'][^>]*>/i.test(html)
}

function simpleCaptchaSelection(responseText: string): string | null {
  try {
    const payload = JSON.parse(responseText) as { readonly images?: ReadonlyArray<unknown> }
    const first = Array.isArray(payload.images) ? payload.images[0] : undefined
    if (typeof first !== "object" || first === null || !("hash" in first)) return null

    const hash = (first as { readonly hash?: unknown }).hash
    return typeof hash === "string" && hash.trim().length > 0 ? hash.trim() : null
  } catch {
    return null
  }
}

function simpleCaptchaUrl(baseUrl: string): URL {
  return new URL("simpleCaptcha.php?numImages=1", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)
}

function executeFormLoginRequests(
  config: IndexerConfig,
  login: CardigannLoginRuntime,
  baseUrl: string,
  variables: Record<string, TemplateValue>,
  cookieJar: Map<string, string>,
): Effect.Effect<void, IndexerError> {
  return Effect.gen(function* () {
    for (const path of login.paths) {
      const landingUrl = new URL(
        renderTemplate(path.path, variables),
        baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
      )
      const landingHeaders = loginHeaders(login, path, variables)
      const landingInit: RequestInit = {}
      if (Array.from(landingHeaders).length > 0) landingInit.headers = landingHeaders

      const landingResponse = yield* fetchIndexerResponseText(
        landingUrl,
        config,
        withCookieHeader(landingInit, cookieJarValues(cookieJar)),
      )
      for (const cookie of cookiePairsFromHeaders(landingResponse.headers)) {
        addCookiePair(cookieJar, cookie)
      }

      const form = findHtmlElements(landingResponse.text, login.form ?? "form")[0]
      if (form === undefined) {
        return yield* Effect.fail(
          new IndexerError({
            indexerId: config.id,
            indexerName: config.name,
            reason: "auth_failed",
            message: "Cardigann login failed: form not found",
            retryable: false,
          }),
        )
      }

      const submitUrl = resolveFormSubmitUrl(landingUrl, form, login, variables)
      const formParams = formParamsFromHtml(
        htmlDocumentMatch(landingResponse.text),
        form,
        login,
        variables,
      )
      if (typeof formParams === "string") {
        return yield* Effect.fail(
          new IndexerError({
            indexerId: config.id,
            indexerName: config.name,
            reason: "auth_failed",
            message: formParams,
            retryable: false,
          }),
        )
      }
      for (const [key, value] of formParams.queryParams) {
        submitUrl.searchParams.set(key, value)
      }
      const body = formParams.params
      const submitHeaders = loginHeaders(login, path, variables)
      if (hasSimpleCaptcha(landingResponse.text)) {
        const captchaHeaders = loginHeaders(login, path, variables)
        captchaHeaders.set("referer", landingUrl.toString())
        const captchaResponse = yield* fetchIndexerResponseText(
          simpleCaptchaUrl(baseUrl),
          config,
          withCookieHeader({ headers: captchaHeaders }, cookieJarValues(cookieJar)),
        )
        for (const cookie of cookiePairsFromHeaders(captchaResponse.headers)) {
          addCookiePair(cookieJar, cookie)
        }

        const selection = simpleCaptchaSelection(captchaResponse.text)
        if (selection === null) {
          return yield* Effect.fail(
            new IndexerError({
              indexerId: config.id,
              indexerName: config.name,
              reason: "invalid_response",
              message: "Cardigann simpleCaptcha response did not include an image hash",
              retryable: false,
            }),
          )
        }
        body.set("captchaSelection", selection)
        body.set("submitme", "X")
      }
      const submitBody = isMultipartForm(form) ? multipartFormBody(body) : null
      if (submitBody !== null) {
        submitHeaders.set("content-type", submitBody.contentType)
      } else if (!submitHeaders.has("content-type")) {
        submitHeaders.set("content-type", "application/x-www-form-urlencoded")
      }
      const submitInit: RequestInit = {
        method: "POST",
        body: submitBody?.body ?? body,
        headers: submitHeaders,
      }

      const submitResponse = yield* fetchIndexerResponseText(
        submitUrl,
        config,
        withCookieHeader(submitInit, cookieJarValues(cookieJar)),
      )
      for (const error of login.errors) {
        const message = loginErrorMessage(submitResponse.text, error, variables)
        if (message === null) continue

        return yield* Effect.fail(
          new IndexerError({
            indexerId: config.id,
            indexerName: config.name,
            reason: "auth_failed",
            message,
            retryable: false,
          }),
        )
      }
      for (const cookie of cookiePairsFromHeaders(submitResponse.headers)) {
        addCookiePair(cookieJar, cookie)
      }
    }
  })
}

function executeLoginRequests(
  config: IndexerConfig,
  definition: CardigannRuntimeDefinition,
  baseUrl: string,
): Effect.Effect<ReadonlyArray<string>, IndexerError> {
  return Effect.gen(function* () {
    if (definition.login === null) return []

    const cookieJar = new Map<string, string>()
    const variables = configTemplateVariables(config, baseUrl, definition.authFields)

    for (const cookieTemplate of definition.login.cookies) {
      addCookieHeaderValue(cookieJar, renderTemplate(cookieTemplate, variables))
    }

    if (definition.login.method === "cookie") {
      addCookieHeaderValue(
        cookieJar,
        renderTemplate(definition.login.inputs.cookie ?? "", variables),
      )
      return cookieJarValues(cookieJar)
    }

    if (definition.login.method === "form") {
      yield* executeFormLoginRequests(config, definition.login, baseUrl, variables, cookieJar)
      return cookieJarValues(cookieJar)
    }

    const requests = resolveLoginRequests(config, definition, baseUrl)
    for (const request of requests) {
      const response = yield* fetchIndexerResponseText(
        request.url,
        config,
        withCookieHeader(request.init, cookieJarValues(cookieJar)),
      )
      for (const error of definition.login.errors) {
        const message = loginErrorMessage(response.text, error, variables)
        if (message === null) continue

        return yield* Effect.fail(
          new IndexerError({
            indexerId: config.id,
            indexerName: config.name,
            reason: "auth_failed",
            message,
            retryable: false,
          }),
        )
      }
      for (const cookie of cookiePairsFromHeaders(response.headers)) {
        addCookiePair(cookieJar, cookie)
      }
    }

    return cookieJarValues(cookieJar)
  })
}

function resolveSearchRequests(
  config: IndexerConfig,
  definition: CardigannRuntimeDefinition,
  query: SearchQuery,
): ReadonlyArray<CardigannSearchRequest> {
  const queryType = requestedSearchType(definition, query)
  if (queryType === null) return []

  const trackerCategories = mappedTrackerCategories(definition, query)
  const baseUrl = config.baseUrl || definition.baseUrl
  if (!baseUrl) return []

  const rawKeywords = query.term.trim()
  const initialVariables = templateVariables(
    config,
    query,
    queryType,
    trackerCategories,
    rawKeywords,
    baseUrl,
    definition.authFields,
  )
  const variables = {
    ...initialVariables,
    ".Keywords": applyCardigannKeywordFilters(
      rawKeywords,
      definition.search.keywordFilters,
      initialVariables,
    ),
  }
  const requests = new Map<string, CardigannSearchRequest>()
  for (const path of definition.search.paths) {
    const pathCategories = categoriesForPath(path, trackerCategories)
    if (pathCategories === null) continue
    const pathVariables = { ...variables, ".Categories": pathCategories }

    const url = new URL(
      renderTemplate(path.path, pathVariables),
      baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    )
    const targetParams = path.method === "get" ? url.searchParams : new URLSearchParams()
    const headers = new Headers()
    if (path.inheritInputs) {
      appendInputs(
        targetParams,
        definition.search.inputs,
        pathVariables,
        definition.search.allowEmptyInputs,
      )
    }
    appendInputs(targetParams, path.inputs, pathVariables, definition.search.allowEmptyInputs)
    appendHeaders(
      headers,
      definition.search.headers,
      pathVariables,
      definition.search.allowEmptyInputs,
    )
    appendHeaders(headers, path.headers, pathVariables, definition.search.allowEmptyInputs)

    const init: RequestInit = {}
    if (path.method === "post") {
      init.method = "POST"
      init.body = targetParams
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/x-www-form-urlencoded")
      }
    }
    if (Array.from(headers).length > 0) init.headers = headers
    requests.set(`${path.method} ${url.toString()} ${targetParams.toString()}`, {
      url,
      init,
      responseType: path.responseType,
      ...(path.noResultsMessage !== undefined ? { noResultsMessage: path.noResultsMessage } : {}),
      variables: pathVariables,
    })
  }

  return Array.from(requests.values())
}

export function createCardigannYamlAdapter(config: IndexerConfig): IndexerAdapter {
  return {
    testConnection: () =>
      Effect.gen(function* () {
        const definition = yield* loadRuntimeDefinition(config)
        return definition.capabilities
      }),

    search: (query) =>
      Effect.gen(function* () {
        const definition = yield* loadRuntimeDefinition(config)
        const baseUrl = config.baseUrl || definition.baseUrl
        if (!baseUrl) return []

        const requests = resolveSearchRequests(config, definition, query)
        if (requests.length === 0) return []
        const loginCookies = yield* executeLoginRequests(config, definition, baseUrl)
        const authenticatedRequests =
          loginCookies.length > 0
            ? requests.map((request) => ({
                ...request,
                init: withCookieHeader(request.init, loginCookies),
              }))
            : requests

        const results = yield* Effect.forEach(
          authenticatedRequests,
          (request) =>
            Effect.gen(function* () {
              const usesSelectorParser =
                request.responseType === "html" ||
                request.responseType === "json" ||
                (request.responseType === "xml" && definition.search.rows !== null)

              if (usesSelectorParser) {
                const response = yield* fetchIndexerResponseText(request.url, config, request.init)
                const responseText = applyCardigannPreprocessingFilters(
                  response.text,
                  definition,
                  request.variables,
                )
                if (matchesNoResultsMessage(responseText, request.noResultsMessage)) return []
                const loginTestMessage =
                  request.responseType === "html"
                    ? loginTestFailureMessage(responseText, definition.login)
                    : null
                if (loginTestMessage !== null) {
                  return yield* Effect.fail(
                    new IndexerError({
                      indexerId: config.id,
                      indexerName: config.name,
                      reason: "auth_failed",
                      message: loginTestMessage,
                      retryable: false,
                    }),
                  )
                }

                return yield* Effect.try({
                  try: () =>
                    request.responseType === "json"
                      ? parseJsonReleases(responseText, request, definition, config)
                      : parseHtmlReleases(responseText, request, definition, config),
                  catch: (error) =>
                    new IndexerError({
                      indexerId: config.id,
                      indexerName: config.name,
                      reason: "invalid_response",
                      message:
                        error instanceof Error
                          ? error.message
                          : `invalid Cardigann ${request.responseType.toUpperCase()} response`,
                      retryable: true,
                    }),
                })
              }

              const response = yield* fetchIndexerResponseText(request.url, config, request.init)
              const responseText = applyCardigannPreprocessingFilters(
                response.text,
                definition,
                request.variables,
              )
              if (matchesNoResultsMessage(responseText, request.noResultsMessage)) return []
              const parsed = yield* parseIndexerXmlText(responseText, config)
              yield* checkTorznabError(parsed, config)
              return parseTorznabReleases(parsed, {
                ...config,
                protocol: definition.protocol,
              })
            }),
          { concurrency: "unbounded" },
        )

        return results.flat() satisfies ReadonlyArray<ReleaseCandidate>
      }),
  }
}

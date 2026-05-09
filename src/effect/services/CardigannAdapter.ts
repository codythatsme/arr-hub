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
  type CardigannResponseType,
  type CardigannRuntimeDefinition,
  type CardigannSearchPath,
  getBuiltInCardigannRuntimeDefinition,
  parseCardigannRuntimeDefinitionYaml,
} from "./CardigannDefinitionLoader"
import type { IndexerAdapter } from "./IndexerAdapter"
import {
  checkTorznabError,
  fetchIndexerResponseText,
  fetchIndexerText,
  fetchIndexerXml,
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
  readonly variables: Record<string, TemplateValue>
}

interface CardigannLoginRequest {
  readonly url: URL
  readonly init: RequestInit
}

interface HtmlElementMatch {
  readonly attributes: Readonly<Record<string, string>>
  readonly innerHtml: string
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

function urlDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
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
    case "urldecode":
    case "urldecodecomponent":
      return urlDecode(value)
    case "queryescape":
    case "urlencode":
    case "urlencodecomponent":
      return encodeURIComponent(value)
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

function simpleSelectorToken(selector: string): string {
  const tokens = selector
    .trim()
    .split(/\s*>\s*|\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
  return tokens.at(-1)?.replace(/:(?:first|last)-child\b/g, "") ?? ""
}

function parseSimpleHtmlSelector(selector: string): SimpleHtmlSelector | null {
  const token = simpleSelectorToken(selector)
  if (token.length === 0 || token.includes(":")) return null

  const tagMatch = token.match(/^[A-Za-z][\w:-]*/)
  const idMatch = token.match(/#([\w-]+)/)
  const classes = Array.from(token.matchAll(/\.([\w-]+)/g)).map((match) => match[1] ?? "")
  const attributes = Array.from(
    token.matchAll(/\[([\w:-]+)(?:\s*([*^$]?=)\s*["']?([^"'\]]*)["']?)?\]/g),
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

function htmlAttributeMatches(
  attributes: Readonly<Record<string, string>>,
  selector: SimpleHtmlSelector,
): boolean {
  if (selector.id !== null && attributes.id !== selector.id) return false

  const classes = new Set((attributes.class ?? "").split(/\s+/).filter((item) => item.length > 0))
  if (selector.classes.some((className) => !classes.has(className))) return false

  return selector.attributes.every((attribute) => {
    const actual = attributes[attribute.name.toLowerCase()]
    if (actual === undefined) return false
    if (attribute.operator === null) return true
    if (attribute.operator === "=") return actual === attribute.value
    if (attribute.operator === "^=") return actual.startsWith(attribute.value)
    if (attribute.operator === "$=") return actual.endsWith(attribute.value)
    if (attribute.operator === "*=") return actual.includes(attribute.value)
    return false
  })
}

function findHtmlElements(html: string, selectorText: string): ReadonlyArray<HtmlElementMatch> {
  const selector = parseSimpleHtmlSelector(selectorText)
  if (selector === null) return []

  const tagPattern = selector.tag ? escapeRegExp(selector.tag) : "[A-Za-z][\\w:-]*"
  const elementPattern = new RegExp(`<(${tagPattern})\\b([^>]*)>([\\s\\S]*?)<\\/\\1>`, "gi")
  const matches: Array<HtmlElementMatch> = []
  for (const match of html.matchAll(elementPattern)) {
    const tagName = (match[1] ?? "").toLowerCase()
    if (selector.tag !== null && tagName !== selector.tag) continue

    const attributes = parseHtmlAttributes(match[2] ?? "")
    if (htmlAttributeMatches(attributes, selector)) {
      matches.push({ attributes, innerHtml: match[3] ?? "" })
    }
  }
  return matches
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
  const selected = field.selector ? findHtmlElements(row.innerHtml, field.selector)[0] : row
  let value = ""
  if (field.text !== undefined) {
    value = renderTemplate(field.text, variables)
  } else if (selected) {
    value = field.attribute
      ? (selected.attributes[field.attribute.toLowerCase()] ?? "")
      : htmlTextContent(selected.innerHtml)
  }

  if (value.trim().length === 0 && field.defaultValue !== undefined) {
    value = renderTemplate(field.defaultValue, variables)
  }

  return applyCardigannFieldFilters(value.trim(), field.filters, variables).trim()
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
  if (definition.search.rows === null) return []

  const rows = findHtmlElements(html, definition.search.rows.selector)
  const now = Date.now()

  return rows.map((row): ReleaseCandidate => {
    const resultFields: Record<string, string> = {}
    const variables = { ...request.variables }
    for (const [name, field] of Object.entries(definition.search.fields)) {
      const value = htmlFieldValue(row, field, variables)
      resultFields[name] = value
      variables[`.Result.${name}`] = value
    }

    const publishedAt = parseHtmlDate(fieldByName(resultFields, ["date", "pubdate", "publishdate"]))
    const ageDays = Math.max(0, Math.floor((now - publishedAt.getTime()) / 86_400_000))
    const downloadUrl = absoluteUrl(
      fieldByName(resultFields, ["download", "downloadurl", "link"]),
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
      category: releaseCategory(definition, fieldByName(resultFields, ["category"])),
      protocol: definition.protocol,
      publishedAt,
      infohash: fieldByName(resultFields, ["infohash"]).trim() || null,
      downloadFactor: Number(fieldByName(resultFields, ["downloadvolumefactor"])) || 1,
      uploadFactor: Number(fieldByName(resultFields, ["uploadvolumefactor"])) || 1,
    }
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

function addCookiePair(jar: Map<string, string>, cookie: string): void {
  const separator = cookie.indexOf("=")
  if (separator <= 0) return
  const name = cookie.slice(0, separator).trim()
  if (name.length > 0) jar.set(name, cookie)
}

function cookieJarValues(jar: ReadonlyMap<string, string>): ReadonlyArray<string> {
  return Array.from(jar.values())
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

function resolveLoginRequests(
  config: IndexerConfig,
  definition: CardigannRuntimeDefinition,
  baseUrl: string,
): ReadonlyArray<CardigannLoginRequest> {
  if (definition.login === null) return []

  const variables = configTemplateVariables(config, baseUrl, definition.authFields)
  const requests: Array<CardigannLoginRequest> = []
  for (const path of definition.login.paths) {
    const url = new URL(
      renderTemplate(path.path, variables),
      baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    )
    const targetParams = path.method === "get" ? url.searchParams : new URLSearchParams()
    const headers = new Headers()
    appendInputs(targetParams, definition.login.inputs, variables, false)
    appendInputs(targetParams, path.inputs, variables, false)
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

function executeLoginRequests(
  config: IndexerConfig,
  definition: CardigannRuntimeDefinition,
  baseUrl: string,
): Effect.Effect<ReadonlyArray<string>, IndexerError> {
  const requests = resolveLoginRequests(config, definition, baseUrl)
  if (requests.length === 0) return Effect.succeed([])

  return Effect.gen(function* () {
    const cookieJar = new Map<string, string>()
    for (const request of requests) {
      const response = yield* fetchIndexerResponseText(
        request.url,
        config,
        withCookieHeader(request.init, cookieJarValues(cookieJar)),
      )
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
              if (request.responseType === "html") {
                const html = yield* fetchIndexerText(request.url, config, request.init)
                return yield* Effect.try({
                  try: () => parseHtmlReleases(html, request, definition, config),
                  catch: (error) =>
                    new IndexerError({
                      indexerId: config.id,
                      indexerName: config.name,
                      reason: "invalid_response",
                      message:
                        error instanceof Error ? error.message : "invalid Cardigann HTML response",
                      retryable: true,
                    }),
                })
              }

              const parsed = yield* fetchIndexerXml(request.url, config, request.init)
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

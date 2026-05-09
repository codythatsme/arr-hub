import { Effect } from "effect"

import type {
  IndexerAdapterMetadata,
  IndexerConfig,
  ReleaseCandidate,
  SearchQuery,
} from "../domain/indexer"
import { IndexerError } from "../errors"
import {
  type CardigannRuntimeDefinition,
  type CardigannSearchPath,
  getBuiltInCardigannRuntimeDefinition,
  parseCardigannRuntimeDefinitionYaml,
} from "./CardigannDefinitionLoader"
import type { IndexerAdapter } from "./IndexerAdapter"
import { checkTorznabError, fetchIndexerXml, parseTorznabReleases } from "./TorznabAdapter"

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
  if (!query.categories || query.categories.length === 0) return []
  const requested = new Set(query.categories)
  return definition.categories
    .filter((category) => requested.has(category.newznabCategory))
    .map((category) => category.trackerCategory)
}

function pathMatchesCategories(
  path: CardigannSearchPath,
  trackerCategories: ReadonlyArray<string>,
): boolean {
  if (path.categories.length === 0 || trackerCategories.length === 0) return true

  const negated = path.categories[0] === "!"
  const allowed = new Set(negated ? path.categories.slice(1) : path.categories)
  const intersects = trackerCategories.some((category) => allowed.has(category))
  return negated ? !intersects : intersects
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

function configTemplateVariables(config: IndexerConfig): Record<string, string> {
  const variables: Record<string, string> = {
    ".Config.APIKey": config.apiKey,
    ".Config.ApiKey": config.apiKey,
    ".Config.apiKey": config.apiKey,
  }

  for (const [key, value] of Object.entries(config.configValues ?? {})) {
    for (const variant of configKeyVariants(key)) {
      variables[`.Config.${variant}`] = value
    }
  }

  return variables
}

function templateVariables(
  config: IndexerConfig,
  query: SearchQuery,
  queryType: string,
  trackerCategories: ReadonlyArray<string>,
): Record<string, TemplateValue> {
  const categoryStrings = (query.categories ?? []).map(String)
  const term = query.term.trim()
  return {
    ...configTemplateVariables(config),
    ".Query.Type": queryType,
    ".Query.Q": term,
    ".Query.Keywords": term,
    ".Query.Categories": categoryStrings,
    ".Query.Limit": query.limit ? String(query.limit) : "",
    ".Query.IMDBID": query.imdbId ?? "",
    ".Query.IMDBIDShort": query.imdbId?.replace(/^tt/, "") ?? "",
    ".Query.TMDBID": query.tmdbId ? String(query.tmdbId) : "",
    ".Query.TVDBID": query.tvdbId ? String(query.tvdbId) : "",
    ".Query.Season": query.season ? String(query.season) : "",
    ".Query.Ep": query.episode ? String(query.episode) : "",
    ".Query.Episode": query.episode ? String(query.episode) : "",
    ".Keywords": term,
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
    case "lower":
    case "lowercase":
    case "tolower":
      return text.toLowerCase()
    case "prepend":
      return `${args[0] ?? ""}${text}`
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
    default:
      return text
  }
}

function renderTemplate(template: string, variables: Record<string, TemplateValue>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expression: string) => {
    const [key = "", ...filters] = splitTemplatePipeline(expression)
    let value = variables[key.trim()]
    for (const filterExpression of filters) {
      const filter = parseFilterCall(filterExpression)
      value = applyTemplateFilter(value, filter.name, filter.args)
    }
    return templateValueToString(value)
  })
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

function resolveSearchRequests(
  config: IndexerConfig,
  definition: CardigannRuntimeDefinition,
  query: SearchQuery,
): ReadonlyArray<CardigannSearchRequest> {
  const queryType = requestedSearchType(definition, query)
  if (queryType === null) return []

  const trackerCategories = mappedTrackerCategories(definition, query)
  const variables = templateVariables(config, query, queryType, trackerCategories)
  const baseUrl = config.baseUrl || definition.baseUrl
  if (!baseUrl) return []

  const requests = new Map<string, CardigannSearchRequest>()
  for (const path of definition.search.paths) {
    if (!pathMatchesCategories(path, trackerCategories)) continue

    const url = new URL(
      renderTemplate(path.path, variables),
      baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    )
    const targetParams = path.method === "get" ? url.searchParams : new URLSearchParams()
    const headers = new Headers()
    appendInputs(
      targetParams,
      definition.search.inputs,
      variables,
      definition.search.allowEmptyInputs,
    )
    appendInputs(targetParams, path.inputs, variables, definition.search.allowEmptyInputs)
    appendHeaders(headers, definition.search.headers, variables, definition.search.allowEmptyInputs)
    appendHeaders(headers, path.headers, variables, definition.search.allowEmptyInputs)

    const init: RequestInit = {}
    if (path.method === "post") {
      init.method = "POST"
      init.body = targetParams
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/x-www-form-urlencoded")
      }
    }
    if (Array.from(headers).length > 0) init.headers = headers
    requests.set(`${path.method} ${url.toString()} ${targetParams.toString()}`, { url, init })
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
        const requests = resolveSearchRequests(config, definition, query)
        if (requests.length === 0) return []

        const results = yield* Effect.forEach(
          requests,
          (request) =>
            Effect.gen(function* () {
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

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

function templateVariables(
  config: IndexerConfig,
  query: SearchQuery,
  queryType: string,
  trackerCategories: ReadonlyArray<string>,
): Record<string, TemplateValue> {
  const categoryStrings = (query.categories ?? []).map(String)
  const term = query.term.trim()
  return {
    ".Config.APIKey": config.apiKey,
    ".Config.ApiKey": config.apiKey,
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

function renderTemplate(template: string, variables: Record<string, TemplateValue>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expression: string) => {
    const key = expression.split("|", 1)[0].trim()
    const value = variables[key]
    if (typeof value === "string") return value
    return value ? value.join(",") : ""
  })
}

function appendRawQuery(url: URL, raw: string): void {
  for (const part of raw.split("&")) {
    if (part.length === 0) continue
    const [key, value = ""] = part.split("=", 2)
    if (key.length > 0) url.searchParams.append(key, value)
  }
}

function appendInputs(
  url: URL,
  inputs: Readonly<Record<string, string>>,
  variables: Record<string, TemplateValue>,
  allowEmptyInputs: boolean,
): void {
  for (const [key, template] of Object.entries(inputs)) {
    const value = renderTemplate(template, variables)
    if (value.length === 0 && !allowEmptyInputs) continue

    if (key === "$raw") {
      appendRawQuery(url, value)
    } else {
      url.searchParams.append(key, value)
    }
  }
}

function resolveSearchUrls(
  config: IndexerConfig,
  definition: CardigannRuntimeDefinition,
  query: SearchQuery,
): ReadonlyArray<URL> {
  const queryType = requestedSearchType(definition, query)
  if (queryType === null) return []

  const trackerCategories = mappedTrackerCategories(definition, query)
  const variables = templateVariables(config, query, queryType, trackerCategories)
  const baseUrl = config.baseUrl || definition.baseUrl
  if (!baseUrl) return []

  const urls = new Map<string, URL>()
  for (const path of definition.search.paths) {
    if (path.method !== "get" || !pathMatchesCategories(path, trackerCategories)) continue

    const url = new URL(
      renderTemplate(path.path, variables),
      baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    )
    appendInputs(url, definition.search.inputs, variables, definition.search.allowEmptyInputs)
    appendInputs(url, path.inputs, variables, definition.search.allowEmptyInputs)
    urls.set(url.toString(), url)
  }

  return Array.from(urls.values())
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
        const urls = resolveSearchUrls(config, definition, query)
        if (urls.length === 0) return []

        const results = yield* Effect.forEach(
          urls,
          (url) =>
            Effect.gen(function* () {
              const parsed = yield* fetchIndexerXml(url, config)
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

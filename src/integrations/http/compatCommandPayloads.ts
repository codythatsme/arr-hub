import type { SchedulerJobPayload } from "#/effect/domain/scheduler"
import { ValidationError } from "#/effect/errors"

export type CommandPayloadSpec =
  | SchedulerJobPayload
  | {
      readonly _tag: "tv_search_season_by_number"
      readonly seriesId: number
      readonly seasonNumber: number
    }

export function commandPayloadSpecsFromBody(
  body: unknown,
): ReadonlyArray<CommandPayloadSpec> | ValidationError {
  const input = objectFromUnknown(body)
  if (!input) return new ValidationError({ message: "command body must be an object" })

  const rawName = stringField(input, "name") ?? stringField(input, "commandName")
  if (!rawName) return new ValidationError({ message: "command name is required" })

  const name = normalizeCommandName(rawName)

  switch (name) {
    case "rsssync":
      return [{ _tag: "rss_sync" }]
    case "tvrsssync":
      return [{ _tag: "tv_rss_sync" }]
    case "moviessearch":
    case "missingmoviessearch": {
      const movieIds = idsFromFields(input, "movieIds", "movieId")
      if (movieIds instanceof ValidationError) return movieIds
      if (movieIds.length === 0) {
        return new ValidationError({ message: `${rawName} requires movieId or movieIds` })
      }
      return movieIds.map((movieId) => ({ _tag: "search_missing", movieId }))
    }
    case "cutoffunmetmoviessearch":
      return [{ _tag: "search_cutoff" }]
    case "seriessearch": {
      const seriesId = positiveIntegerField(input, "seriesId")
      if (seriesId instanceof ValidationError) return seriesId
      return [{ _tag: "tv_search_series", seriesId }]
    }
    case "seasonsearch": {
      const seasonId = optionalPositiveIntegerField(input, "seasonId")
      if (seasonId instanceof ValidationError) return seasonId
      if (seasonId !== null) return [{ _tag: "tv_search_season", seasonId }]

      const seriesId = positiveIntegerField(input, "seriesId")
      if (seriesId instanceof ValidationError) return seriesId
      const seasonNumber = nonNegativeIntegerField(input, "seasonNumber")
      if (seasonNumber instanceof ValidationError) return seasonNumber
      return [{ _tag: "tv_search_season_by_number", seriesId, seasonNumber }]
    }
    case "episodesearch": {
      const episodeIds = idsFromFields(input, "episodeIds", "episodeId")
      if (episodeIds instanceof ValidationError) return episodeIds
      if (episodeIds.length === 0) {
        return new ValidationError({ message: "EpisodeSearch requires episodeId or episodeIds" })
      }
      return episodeIds.map((episodeId) => ({ _tag: "tv_search_episode", episodeId }))
    }
    case "missingepisodesearch": {
      const seriesId = optionalPositiveIntegerField(input, "seriesId")
      if (seriesId instanceof ValidationError) return seriesId
      if (seriesId !== null) return [{ _tag: "tv_search_series", seriesId }]
      return new ValidationError({ message: "MissingEpisodeSearch requires seriesId" })
    }
    case "cutoffunmetepisodesearch":
      return [{ _tag: "tv_search_cutoff" }]
    case "refreshmonitoreddownloads":
    case "refreshdownloads":
    case "checkforfinisheddownload":
    case "processmonitoreddownloads":
      return [{ _tag: "download_monitor" }]
    case "applicationindexersync":
      return [{ _tag: "indexer_application_sync" }]
    case "indexerdefinitionupdate":
    case "updateindexerdefinitions":
      return [{ _tag: "indexer_definition_refresh" }]
    case "backup":
      return [{ _tag: "database_backup" }]
    case "housekeeping":
      return [{ _tag: "housekeeping" }]
    case "refreshmovie":
      return [{ _tag: "movie_metadata_refresh" }]
    case "refreshseries":
      return [{ _tag: "series_metadata_refresh" }]
    default:
      return new ValidationError({ message: `unsupported command ${rawName}` })
  }
}

export function normalizeCommandName(name: string): string {
  return name
    .replaceAll(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .replace(/command$/, "")
}

function objectFromUnknown(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stringField(input: Record<string, unknown>, name: string): string | null {
  const value = input[name]
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function positiveIntegerField(
  input: Record<string, unknown>,
  name: string,
): number | ValidationError {
  const value = optionalPositiveIntegerField(input, name)
  if (value instanceof ValidationError) return value
  if (value === null) return new ValidationError({ message: `${name} is required` })
  return value
}

function optionalPositiveIntegerField(
  input: Record<string, unknown>,
  name: string,
): number | ValidationError | null {
  const value = input[name]
  if (value === undefined || value === null || value === "") return null
  return integerValue(value, name, 1)
}

function nonNegativeIntegerField(
  input: Record<string, unknown>,
  name: string,
): number | ValidationError {
  const value = input[name]
  if (value === undefined || value === null || value === "") {
    return new ValidationError({ message: `${name} is required` })
  }
  return integerValue(value, name, 0)
}

function idsFromFields(
  input: Record<string, unknown>,
  arrayName: string,
  singleName: string,
): ReadonlyArray<number> | ValidationError {
  const rawArray = input[arrayName]
  const rawSingle = input[singleName]
  const values: Array<unknown> = []

  if (Array.isArray(rawArray)) values.push(...rawArray)
  else if (rawArray !== undefined && rawArray !== null && rawArray !== "") values.push(rawArray)

  if (rawSingle !== undefined && rawSingle !== null && rawSingle !== "") values.push(rawSingle)
  if (values.length === 0) return []

  const ids: Array<number> = []
  for (const value of values) {
    const id = integerValue(value, arrayName, 1)
    if (id instanceof ValidationError) return id
    ids.push(id)
  }
  return [...new Set(ids)]
}

function integerValue(value: unknown, name: string, minimum: number): number | ValidationError {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN
  if (!Number.isInteger(parsed) || parsed < minimum) {
    return new ValidationError({
      message:
        minimum === 0
          ? `${name} must be a non-negative integer`
          : `${name} must be a positive integer`,
    })
  }
  return parsed
}

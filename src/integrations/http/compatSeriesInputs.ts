import { ValidationError } from "#/effect/errors"
import type { SeasonInput, SeriesInput, SeriesUpdate } from "#/effect/services/SeriesService"

type LocalSeriesStatus = NonNullable<SeriesInput["status"]>

export function seriesCreateInputFromBody(body: unknown): SeriesInput | ValidationError {
  const input = objectFromUnknown(body)
  if (!input) return new ValidationError({ message: "series body must be an object" })

  const tvdbId = positiveIntegerField(input, "tvdbId")
  if (tvdbId instanceof ValidationError) return tvdbId

  const title = stringField(input, "title")
  if (title === undefined || title === null || title.length === 0) {
    return new ValidationError({ message: "title is required" })
  }

  const update = seriesUpdateInputFromObject(input)
  if (update instanceof ValidationError) return update

  const seasons = optionalSeasonsField(input)
  if (seasons instanceof ValidationError) return seasons

  return {
    ...update,
    tvdbId,
    title,
    ...(seasons === undefined ? {} : { seasons }),
  }
}

export function seriesUpdateInputFromBody(body: unknown): SeriesUpdate | ValidationError {
  const input = objectFromUnknown(body)
  if (!input) return new ValidationError({ message: "series body must be an object" })
  return seriesUpdateInputFromObject(input)
}

function seriesUpdateInputFromObject(
  input: Record<string, unknown>,
): SeriesUpdate | ValidationError {
  const update: Record<string, unknown> = {}

  const title = optionalStringField(input, "title")
  if (title instanceof ValidationError) return title
  if (title !== undefined) update.title = title

  const tmdbId = optionalPositiveIntegerField(input, "tmdbId")
  if (tmdbId instanceof ValidationError) return tmdbId
  if (tmdbId !== undefined) update.tmdbId = tmdbId

  const imdbId = optionalStringField(input, "imdbId")
  if (imdbId instanceof ValidationError) return imdbId
  if (imdbId !== undefined) update.imdbId = imdbId

  const originalTitle = optionalStringField(input, "originalTitle")
  if (originalTitle instanceof ValidationError) return originalTitle
  if (originalTitle !== undefined) update.originalTitle = originalTitle

  const year = optionalIntegerField(input, "year", 0)
  if (year instanceof ValidationError) return year
  if (year !== undefined) update.year = year

  const overview = optionalStringField(input, "overview")
  if (overview instanceof ValidationError) return overview
  if (overview !== undefined) update.overview = overview

  const posterPath = optionalPosterPath(input)
  if (posterPath instanceof ValidationError) return posterPath
  if (posterPath !== undefined) update.posterPath = posterPath

  const status = optionalStatusField(input)
  if (status instanceof ValidationError) return status
  if (status !== undefined) update.status = status

  const network = optionalStringField(input, "network")
  if (network instanceof ValidationError) return network
  if (network !== undefined) update.network = network

  const genres = optionalStringArrayField(input, "genres")
  if (genres instanceof ValidationError) return genres
  if (genres !== undefined) update.genres = genres

  const runtimeMinutes = optionalIntegerField(input, "runtime", 0)
  if (runtimeMinutes instanceof ValidationError) return runtimeMinutes
  if (runtimeMinutes !== undefined) update.runtimeMinutes = runtimeMinutes

  const seriesType = optionalStringField(input, "seriesType")
  if (seriesType instanceof ValidationError) return seriesType
  if (seriesType !== undefined) update.seriesType = seriesType

  const certification = optionalStringField(input, "certification")
  if (certification instanceof ValidationError) return certification
  if (certification !== undefined) update.certification = certification

  const rootFolderPath = optionalRootFolderPath(input)
  if (rootFolderPath instanceof ValidationError) return rootFolderPath
  if (rootFolderPath !== undefined) update.rootFolderPath = rootFolderPath

  const monitored = optionalBooleanField(input, "monitored")
  if (monitored instanceof ValidationError) return monitored
  if (monitored !== undefined) update.monitored = monitored

  const qualityProfileId = optionalIntegerField(input, "qualityProfileId", 1)
  if (qualityProfileId instanceof ValidationError) return qualityProfileId
  if (qualityProfileId !== undefined) update.qualityProfileId = qualityProfileId

  const seasonFolder = optionalBooleanField(input, "seasonFolder")
  if (seasonFolder instanceof ValidationError) return seasonFolder
  if (seasonFolder !== undefined) update.seasonFolder = seasonFolder

  return update
}

function objectFromUnknown(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stringField(input: Record<string, unknown>, name: string): string | null | undefined {
  const value = input[name]
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== "string") return null
  return value.trim()
}

function optionalStringField(
  input: Record<string, unknown>,
  name: string,
): string | null | undefined | ValidationError {
  const value = input[name]
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== "string") {
    return new ValidationError({ message: `${name} must be a string` })
  }
  return value.trim()
}

function positiveIntegerField(
  input: Record<string, unknown>,
  name: string,
): number | ValidationError {
  const value = optionalIntegerField(input, name, 1)
  if (value instanceof ValidationError) return value
  if (value === undefined) return new ValidationError({ message: `${name} is required` })
  return value
}

function optionalPositiveIntegerField(
  input: Record<string, unknown>,
  name: string,
): number | null | undefined | ValidationError {
  const value = input[name]
  if (value === undefined) return undefined
  if (value === null || value === "" || value === 0) return null
  if (typeof value === "string" && value.trim() === "0") return null
  return optionalIntegerField(input, name, 1)
}

function optionalIntegerField(
  input: Record<string, unknown>,
  name: string,
  minimum: number,
): number | undefined | ValidationError {
  const value = input[name]
  if (value === undefined || value === null || value === "") return undefined
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN
  if (!Number.isInteger(parsed) || parsed < minimum) {
    return new ValidationError({ message: `${name} must be an integer >= ${minimum}` })
  }
  return parsed
}

function optionalPosterPath(
  input: Record<string, unknown>,
): string | null | undefined | ValidationError {
  if (input.remotePoster !== undefined) return optionalStringField(input, "remotePoster")
  if (input.posterPath !== undefined) return optionalStringField(input, "posterPath")
  return undefined
}

function optionalRootFolderPath(
  input: Record<string, unknown>,
): string | null | undefined | ValidationError {
  if (input.rootFolderPath !== undefined) return optionalStringField(input, "rootFolderPath")
  if (input.path !== undefined) return optionalStringField(input, "path")
  return undefined
}

function optionalStringArrayField(
  input: Record<string, unknown>,
  name: string,
): ReadonlyArray<string> | undefined | ValidationError {
  const value = input[name]
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return new ValidationError({ message: `${name} must be an array of strings` })
  }
  return value.map((item) => item.trim()).filter((item) => item.length > 0)
}

function optionalStatusField(
  input: Record<string, unknown>,
): LocalSeriesStatus | undefined | ValidationError {
  const value = input.status
  if (value === undefined || value === null || value === "") return undefined
  if (value === "continuing" || value === "ended" || value === "wanted" || value === "available") {
    return value
  }
  if (value === "upcoming") return "continuing"
  return new ValidationError({ message: "status must be continuing, ended, wanted, or available" })
}

function optionalBooleanField(
  input: Record<string, unknown>,
  name: string,
): boolean | undefined | ValidationError {
  const value = input[name]
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value === "boolean") return value
  return new ValidationError({ message: `${name} must be a boolean` })
}

function optionalSeasonsField(
  input: Record<string, unknown>,
): ReadonlyArray<SeasonInput> | undefined | ValidationError {
  const value = input.seasons
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) return new ValidationError({ message: "seasons must be an array" })

  const seasons: Array<SeasonInput> = []
  for (const item of value) {
    const season = objectFromUnknown(item)
    if (!season) return new ValidationError({ message: "seasons entries must be objects" })
    const seasonNumber = optionalIntegerField(season, "seasonNumber", 0)
    if (seasonNumber instanceof ValidationError) return seasonNumber
    if (seasonNumber === undefined) {
      return new ValidationError({ message: "seasons entries require seasonNumber" })
    }
    const monitored = optionalBooleanField(season, "monitored")
    if (monitored instanceof ValidationError) return monitored

    seasons.push({
      seasonNumber,
      ...(monitored === undefined ? {} : { monitored }),
    })
  }
  return seasons
}

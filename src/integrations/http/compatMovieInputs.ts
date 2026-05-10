import { ValidationError } from "#/effect/errors"

type LocalMovieStatus = "wanted" | "available" | "missing"

export interface CompatibleMovieCreateInput {
  readonly tmdbId: number
  readonly imdbId?: string | null
  readonly title: string
  readonly originalTitle?: string | null
  readonly year?: number | null
  readonly releaseDate?: Date | null
  readonly overview?: string | null
  readonly posterPath?: string | null
  readonly genres?: ReadonlyArray<string>
  readonly runtimeMinutes?: number | null
  readonly status?: LocalMovieStatus
  readonly qualityProfileId?: number | null
  readonly rootFolderPath?: string | null
  readonly monitored?: boolean
}

export interface CompatibleMovieUpdateInput {
  readonly imdbId?: string | null
  readonly title?: string
  readonly originalTitle?: string | null
  readonly year?: number | null
  readonly releaseDate?: Date | null
  readonly overview?: string | null
  readonly posterPath?: string | null
  readonly genres?: ReadonlyArray<string>
  readonly runtimeMinutes?: number | null
  readonly status?: LocalMovieStatus
  readonly qualityProfileId?: number | null
  readonly rootFolderPath?: string | null
  readonly monitored?: boolean
}

export function movieCreateInputFromBody(
  body: unknown,
): CompatibleMovieCreateInput | ValidationError {
  const input = objectFromUnknown(body)
  if (!input) return new ValidationError({ message: "movie body must be an object" })

  const tmdbId = positiveIntegerField(input, "tmdbId")
  if (tmdbId instanceof ValidationError) return tmdbId

  const title = stringField(input, "title")
  if (title === undefined || title === null || title.length === 0) {
    return new ValidationError({ message: "title is required" })
  }

  const update = movieUpdateInputFromObject(input)
  if (update instanceof ValidationError) return update

  return {
    ...update,
    tmdbId,
    title,
  }
}

export function movieUpdateInputFromBody(
  body: unknown,
): CompatibleMovieUpdateInput | ValidationError {
  const input = objectFromUnknown(body)
  if (!input) return new ValidationError({ message: "movie body must be an object" })
  return movieUpdateInputFromObject(input)
}

function movieUpdateInputFromObject(
  input: Record<string, unknown>,
): CompatibleMovieUpdateInput | ValidationError {
  const update: Record<string, unknown> = {}

  const title = optionalStringField(input, "title")
  if (title instanceof ValidationError) return title
  if (title !== undefined) update.title = title

  const imdbId = optionalStringField(input, "imdbId")
  if (imdbId instanceof ValidationError) return imdbId
  if (imdbId !== undefined) update.imdbId = imdbId

  const originalTitle = optionalStringField(input, "originalTitle")
  if (originalTitle instanceof ValidationError) return originalTitle
  if (originalTitle !== undefined) update.originalTitle = originalTitle

  const year = optionalIntegerField(input, "year", 0)
  if (year instanceof ValidationError) return year
  if (year !== undefined) update.year = year

  const releaseDate = optionalDateField(input, "releaseDate")
  if (releaseDate instanceof ValidationError) return releaseDate
  if (releaseDate !== undefined) update.releaseDate = releaseDate

  const overview = optionalStringField(input, "overview")
  if (overview instanceof ValidationError) return overview
  if (overview !== undefined) update.overview = overview

  const posterPath = optionalPosterPath(input)
  if (posterPath instanceof ValidationError) return posterPath
  if (posterPath !== undefined) update.posterPath = posterPath

  const genres = optionalStringArrayField(input, "genres")
  if (genres instanceof ValidationError) return genres
  if (genres !== undefined) update.genres = genres

  const runtimeMinutes = optionalIntegerField(input, "runtime", 0)
  if (runtimeMinutes instanceof ValidationError) return runtimeMinutes
  if (runtimeMinutes !== undefined) update.runtimeMinutes = runtimeMinutes

  const status = optionalStatusField(input)
  if (status instanceof ValidationError) return status
  if (status !== undefined) update.status = status

  const qualityProfileId = optionalIntegerField(input, "qualityProfileId", 1)
  if (qualityProfileId instanceof ValidationError) return qualityProfileId
  if (qualityProfileId !== undefined) update.qualityProfileId = qualityProfileId

  const rootFolderPath = optionalRootFolderPath(input)
  if (rootFolderPath instanceof ValidationError) return rootFolderPath
  if (rootFolderPath !== undefined) update.rootFolderPath = rootFolderPath

  const monitored = optionalBooleanField(input, "monitored")
  if (monitored instanceof ValidationError) return monitored
  if (monitored !== undefined) update.monitored = monitored

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

function optionalDateField(
  input: Record<string, unknown>,
  name: string,
): Date | null | undefined | ValidationError {
  const value = input[name]
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  if (typeof value !== "string") {
    return new ValidationError({ message: `${name} must be an ISO date string` })
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return new ValidationError({ message: `${name} must be an ISO date string` })
  }
  return date
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
): LocalMovieStatus | undefined | ValidationError {
  const value = input.status
  if (value === undefined || value === null || value === "") return undefined
  if (value === "wanted" || value === "available" || value === "missing") return value
  return new ValidationError({ message: "status must be wanted, available, or missing" })
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

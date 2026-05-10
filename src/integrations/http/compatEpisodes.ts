import type { SqlError } from "@effect/sql/SqlError"
import { and, eq, inArray, type SQL } from "drizzle-orm"
import { Effect } from "effect"

import { episodes, seasons, series } from "#/db/schema"
import { ValidationError, NotFoundError } from "#/effect/errors"
import { Db } from "#/effect/services/Db"
import type { CalendarEpisode } from "#/effect/services/SeriesService"
import { SeriesService } from "#/effect/services/SeriesService"
import { runAuthedJson, runAuthedResponse } from "#/integrations/http/effect"

import { calendarEpisodeResource } from "./compatCalendarResources"
import { episodeMonitorInputFromBody } from "./compatEpisodeInputs"

interface RouteHandlerArgs {
  readonly request: Request
}

interface EpisodeQuery {
  readonly seriesId?: number
  readonly seasonNumber?: number
  readonly episodeIds: ReadonlyArray<number>
  readonly episodeFileId?: number
  readonly includeSeries: boolean
}

export function listEpisodesHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const query = episodeQueryFromRequest(request)
  if (query instanceof Response) return query

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const rows = yield* episodeRows(query)
      return rows.map((row) => calendarEpisodeResource(row, { includeSeries: query.includeSeries }))
    }),
  )
}

export function getEpisodeHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id
  const includeSeries = boolParam(new URL(request.url).searchParams, "includeSeries", false)
  if (includeSeries instanceof Response) return includeSeries

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      return calendarEpisodeResource(yield* episodeRowById(id), {
        includeSeries,
      })
    }),
  )
}

export function updateEpisodeHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const body = yield* jsonBody(request)
      const input = episodeMonitorInputFromBody(body)
      if (input instanceof ValidationError) return yield* input

      const seriesService = yield* SeriesService
      yield* seriesService.toggleEpisodeMonitor(id, input.monitored)
      const row = yield* episodeRowById(id)
      return Response.json(calendarEpisodeResource(row), { status: 202 })
    }),
  )
}

function jsonBody(request: Request) {
  return Effect.tryPromise({
    try: () => request.json(),
    catch: () => new ValidationError({ message: "invalid JSON body" }),
  })
}

function episodeRows(
  query: EpisodeQuery,
): Effect.Effect<ReadonlyArray<CalendarEpisode>, SqlError, Db> {
  return Effect.gen(function* () {
    const db = yield* Db
    const conditions: Array<SQL> = []

    if (query.seriesId !== undefined) conditions.push(eq(series.id, query.seriesId))
    if (query.seasonNumber !== undefined)
      conditions.push(eq(seasons.seasonNumber, query.seasonNumber))
    if (query.episodeIds.length > 0) conditions.push(inArray(episodes.id, [...query.episodeIds]))
    if (query.episodeFileId !== undefined) {
      conditions.push(eq(episodes.id, query.episodeFileId))
      conditions.push(eq(episodes.hasFile, true))
    }

    return yield* db
      .select({ episode: episodes, season: seasons, series: series })
      .from(episodes)
      .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
      .innerJoin(series, eq(seasons.seriesId, series.id))
      .where(and(...conditions))
  })
}

function episodeRowById(id: number): Effect.Effect<CalendarEpisode, NotFoundError | SqlError, Db> {
  return Effect.gen(function* () {
    const db = yield* Db
    const rows = yield* db
      .select({ episode: episodes, season: seasons, series: series })
      .from(episodes)
      .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
      .innerJoin(series, eq(seasons.seriesId, series.id))
      .where(eq(episodes.id, id))

    const row = rows[0]
    if (!row) return yield* new NotFoundError({ entity: "episode", id })
    return row
  })
}

function episodeQueryFromRequest(request: Request): EpisodeQuery | Response {
  const params = new URL(request.url).searchParams
  const seriesId = positiveIntegerParam(params, "seriesId", undefined)
  if (seriesId instanceof Response) return seriesId
  const seasonNumber = nonNegativeIntegerParam(params, "seasonNumber", undefined)
  if (seasonNumber instanceof Response) return seasonNumber
  const episodeIds = integerListParam(params, "episodeIds")
  if (episodeIds instanceof Response) return episodeIds
  const episodeFileId = positiveIntegerParam(params, "episodeFileId", undefined)
  if (episodeFileId instanceof Response) return episodeFileId
  const includeSeries = boolParam(params, "includeSeries", false)
  if (includeSeries instanceof Response) return includeSeries

  if (seriesId === undefined && episodeIds.length === 0 && episodeFileId === undefined) {
    return Response.json({ error: "seriesId or episodeIds must be provided" }, { status: 400 })
  }

  return {
    ...(seriesId === undefined ? {} : { seriesId }),
    ...(seasonNumber === undefined ? {} : { seasonNumber }),
    episodeIds,
    ...(episodeFileId === undefined ? {} : { episodeFileId }),
    includeSeries,
  }
}

function validateCompatibleVersion(request: Request): Response | null {
  const version = new URL(request.url).pathname.split("/")[2]
  if (version === "v1" || version === "v3") return null
  return Response.json({ error: "unsupported api version" }, { status: 404 })
}

function idFromPath(request: Request): number | Response {
  const segment = new URL(request.url).pathname.split("/").at(-1)
  const id = Number(segment)
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: "invalid episode id" }, { status: 400 })
  }
  return id
}

function boolParam(params: URLSearchParams, name: string, fallback: boolean): boolean | Response {
  const value = params.get(name)
  if (value === null || value.trim().length === 0) return fallback
  if (value === "true" || value === "1") return true
  if (value === "false" || value === "0") return false
  return Response.json({ error: `${name} must be a boolean` }, { status: 400 })
}

function positiveIntegerParam(
  params: URLSearchParams,
  name: string,
  fallback: number | undefined,
): number | undefined | Response {
  const value = params.get(name)
  if (value === null || value.trim().length === 0) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return Response.json({ error: `${name} must be a positive integer` }, { status: 400 })
  }
  return parsed
}

function nonNegativeIntegerParam(
  params: URLSearchParams,
  name: string,
  fallback: number | undefined,
): number | undefined | Response {
  const value = params.get(name)
  if (value === null || value.trim().length === 0) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    return Response.json({ error: `${name} must be a non-negative integer` }, { status: 400 })
  }
  return parsed
}

function integerListParam(params: URLSearchParams, name: string): ReadonlyArray<number> | Response {
  const values = params
    .getAll(name)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  const parsed = values.map((value) => Number(value))
  if (parsed.some((value) => !Number.isInteger(value) || value < 1)) {
    return Response.json({ error: `${name} must contain positive integers` }, { status: 400 })
  }
  return parsed
}

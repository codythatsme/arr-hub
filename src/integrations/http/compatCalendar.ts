import type { SQL } from "drizzle-orm"
import { and, asc, between, eq, inArray } from "drizzle-orm"
import { Effect } from "effect"

import { episodes, seasons, series, tags as tagTable } from "#/db/schema"
import { NotFoundError } from "#/effect/errors"
import { Db } from "#/effect/services/Db"
import type { CalendarEpisode } from "#/effect/services/SeriesService"
import { runAuthedJson } from "#/integrations/http/effect"

import { calendarEpisodeResource } from "./compatCalendarResources"

interface RouteHandlerArgs {
  readonly request: Request
}

interface CalendarQuery {
  readonly start: Date
  readonly end: Date
  readonly unmonitored: boolean
  readonly includeSeries: boolean
  readonly tagIds: ReadonlyArray<number>
}

export function listCalendarHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const query = calendarQueryFromRequest(request)
  if (query instanceof Response) return query

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const rows = yield* loadCalendarRows(query)
      return rows.map((row) => calendarEpisodeResource(row, { includeSeries: query.includeSeries }))
    }),
  )
}

export function getCalendarEpisodeHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  const includeSeries = boolParam(new URL(request.url).searchParams, "includeSeries", false)
  if (includeSeries instanceof Response) return includeSeries

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      return calendarEpisodeResource(yield* loadCalendarEpisode(id), { includeSeries })
    }),
  )
}

function loadCalendarRows(query: CalendarQuery) {
  return Effect.gen(function* () {
    const db = yield* Db
    const filters: Array<SQL> = [between(episodes.airDate, query.start, query.end)]
    if (!query.unmonitored) {
      filters.push(eq(series.monitored, true), eq(episodes.monitored, true))
    }

    const rows = yield* db
      .select({ episode: episodes, season: seasons, series })
      .from(episodes)
      .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
      .innerJoin(series, eq(seasons.seriesId, series.id))
      .where(and(...filters))
      .orderBy(
        asc(episodes.airDate),
        asc(series.title),
        asc(seasons.seasonNumber),
        asc(episodes.episodeNumber),
      )

    const tagLabels = yield* tagLabelsForIds(query.tagIds)
    if (tagLabels.length === 0 && query.tagIds.length === 0) return rows
    if (tagLabels.length === 0) return []

    return rows.filter((row) => row.series.tags.some((tag) => tagLabels.includes(tag)))
  })
}

function loadCalendarEpisode(id: number) {
  return Effect.gen(function* () {
    const db = yield* Db
    const [row] = yield* db
      .select({ episode: episodes, season: seasons, series })
      .from(episodes)
      .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
      .innerJoin(series, eq(seasons.seriesId, series.id))
      .where(eq(episodes.id, id))

    if (!row) return yield* new NotFoundError({ entity: "episode", id })
    return row satisfies CalendarEpisode
  })
}

function tagLabelsForIds(ids: ReadonlyArray<number>) {
  return Effect.gen(function* () {
    if (ids.length === 0) return []
    const db = yield* Db
    const rows = yield* db
      .select({ label: tagTable.label })
      .from(tagTable)
      .where(inArray(tagTable.id, ids))
    return rows.map((row) => row.label)
  })
}

function calendarQueryFromRequest(request: Request): CalendarQuery | Response {
  const params = new URL(request.url).searchParams
  const today = startOfToday()
  const start = dateParam(params, "start", today)
  if (start instanceof Response) return start

  const end = dateParam(params, "end", addDays(today, 2))
  if (end instanceof Response) return end
  if (end < start) return Response.json({ error: "end must be after start" }, { status: 400 })

  const unmonitored = boolParam(params, "unmonitored", false)
  if (unmonitored instanceof Response) return unmonitored
  const includeSeries = boolParam(params, "includeSeries", false)
  if (includeSeries instanceof Response) return includeSeries

  const tagIds = tagIdsParam(params)
  if (tagIds instanceof Response) return tagIds

  return { start, end, unmonitored, includeSeries, tagIds }
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
    return Response.json({ error: "invalid calendar episode id" }, { status: 400 })
  }
  return id
}

function dateParam(params: URLSearchParams, name: string, fallback: Date): Date | Response {
  const value = params.get(name)
  if (value === null || value.trim().length === 0) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return Response.json({ error: `${name} must be a valid date` }, { status: 400 })
  }
  return date
}

function boolParam(params: URLSearchParams, name: string, fallback: boolean): boolean | Response {
  const value = params.get(name)
  if (value === null || value.trim().length === 0) return fallback
  if (value === "true" || value === "1") return true
  if (value === "false" || value === "0") return false
  return Response.json({ error: `${name} must be a boolean` }, { status: 400 })
}

function tagIdsParam(params: URLSearchParams): ReadonlyArray<number> | Response {
  const value = params.get("tags")
  if (value === null || value.trim().length === 0) return []

  const ids = value.split(",").map((part) => Number(part.trim()))
  if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
    return Response.json({ error: "tags must be comma-separated tag ids" }, { status: 400 })
  }
  return ids
}

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

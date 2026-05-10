import type { SQL } from "drizzle-orm"
import { and, asc, count, desc, eq, gte, inArray } from "drizzle-orm"
import { Effect } from "effect"

import { domainHistory, type DomainHistoryEventType } from "#/db/schema"
import { Db } from "#/effect/services/Db"
import { runAuthedJson } from "#/integrations/http/effect"

import {
  historyPagingResource,
  historyResource,
  localHistoryEventTypes,
} from "./compatHistoryResources"

interface RouteHandlerArgs {
  readonly request: Request
}

interface HistoryQuery {
  readonly page: number
  readonly pageSize: number
  readonly sortKey: string
  readonly sortDirection: "ascending" | "descending"
  readonly eventTypes: ReadonlyArray<DomainHistoryEventType>
  readonly downloadId: string | null
  readonly movieIds: ReadonlyArray<number>
  readonly seriesIds: ReadonlyArray<number>
  readonly episodeId: number | null
  readonly start: Date | null
}

export function listHistoryHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const query = historyQueryFromRequest(request)
  if (query instanceof Response) return query

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const result = yield* loadHistoryPage(query)
      return historyPagingResource({
        rows: result.rows,
        totalRecords: result.totalRecords,
        page: query.page,
        pageSize: query.pageSize,
        sortKey: query.sortKey,
        sortDirection: query.sortDirection,
      })
    }),
  )
}

export function historySinceHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const query = historyQueryFromRequest(request)
  if (query instanceof Response) return query
  if (query.start === null) return Response.json({ error: "date is required" }, { status: 400 })

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const result = yield* loadHistoryPage({
        ...query,
        page: 1,
        pageSize: 200,
        sortDirection: "descending",
      })
      return result.rows.map(historyResource)
    }),
  )
}

export function movieHistoryHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const query = historyQueryFromRequest(request)
  if (query instanceof Response) return query
  const movieId = positiveIntegerParam(new URL(request.url).searchParams, "movieId", null)
  if (movieId instanceof Response) return movieId
  if (movieId === null) return Response.json({ error: "movieId is required" }, { status: 400 })

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const result = yield* loadHistoryPage({
        ...query,
        movieIds: [movieId],
        page: 1,
        pageSize: 200,
      })
      return result.rows.map(historyResource)
    }),
  )
}

export function seriesHistoryHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const query = historyQueryFromRequest(request)
  if (query instanceof Response) return query
  const seriesId = positiveIntegerParam(new URL(request.url).searchParams, "seriesId", null)
  if (seriesId instanceof Response) return seriesId
  if (seriesId === null) return Response.json({ error: "seriesId is required" }, { status: 400 })

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const result = yield* loadHistoryPage({
        ...query,
        seriesIds: [seriesId],
        page: 1,
        pageSize: 200,
      })
      return result.rows.map(historyResource)
    }),
  )
}

function loadHistoryPage(query: HistoryQuery) {
  return Effect.gen(function* () {
    const db = yield* Db
    const where = whereForHistoryQuery(query)
    const [{ totalRecords }] = yield* db
      .select({ totalRecords: count() })
      .from(domainHistory)
      .where(where)
    const rows = yield* db
      .select()
      .from(domainHistory)
      .where(where)
      .orderBy(
        query.sortDirection === "ascending"
          ? asc(domainHistory.createdAt)
          : desc(domainHistory.createdAt),
        desc(domainHistory.id),
      )
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)

    return { rows, totalRecords }
  })
}

function whereForHistoryQuery(query: HistoryQuery): SQL | undefined {
  const filters: Array<SQL> = []
  if (query.eventTypes.length > 0) {
    filters.push(inArray(domainHistory.eventType, [...query.eventTypes]))
  }
  if (query.downloadId) filters.push(eq(domainHistory.downloadExternalId, query.downloadId))
  if (query.movieIds.length > 0) filters.push(inArray(domainHistory.movieId, [...query.movieIds]))
  if (query.seriesIds.length > 0)
    filters.push(inArray(domainHistory.seriesId, [...query.seriesIds]))
  if (query.episodeId !== null) filters.push(eq(domainHistory.episodeId, query.episodeId))
  if (query.start !== null) filters.push(gte(domainHistory.createdAt, query.start))
  return filters.length > 0 ? and(...filters) : undefined
}

function historyQueryFromRequest(request: Request): HistoryQuery | Response {
  const params = new URL(request.url).searchParams
  const page = positiveIntegerParam(params, "page", 1)
  if (page instanceof Response) return page
  const pageSize = positiveIntegerParam(params, "pageSize", 20)
  if (pageSize instanceof Response) return pageSize
  const sortDirection = sortDirectionParam(params)
  if (sortDirection instanceof Response) return sortDirection
  const eventTypes = eventTypeParams(params)
  if (eventTypes instanceof Response) return eventTypes
  const movieIds = integerListParam(params, "movieIds")
  if (movieIds instanceof Response) return movieIds
  const seriesIds = integerListParam(params, "seriesIds")
  if (seriesIds instanceof Response) return seriesIds
  const episodeId = positiveIntegerParam(params, "episodeId", null)
  if (episodeId instanceof Response) return episodeId
  const start = dateParam(params, "date")
  if (start instanceof Response) return start

  return {
    page,
    pageSize,
    sortKey: params.get("sortKey")?.trim() || "date",
    sortDirection,
    eventTypes,
    downloadId: params.get("downloadId")?.trim() || null,
    movieIds,
    seriesIds,
    episodeId,
    start,
  }
}

function validateCompatibleVersion(request: Request): Response | null {
  const version = new URL(request.url).pathname.split("/")[2]
  if (version === "v1" || version === "v3") return null
  return Response.json({ error: "unsupported api version" }, { status: 404 })
}

function positiveIntegerParam(
  params: URLSearchParams,
  name: string,
  fallback: number,
): number | Response
function positiveIntegerParam(
  params: URLSearchParams,
  name: string,
  fallback: null,
): number | Response | null
function positiveIntegerParam(
  params: URLSearchParams,
  name: string,
  fallback: number | null,
): number | Response | null {
  const value = params.get(name)
  if (value === null || value.trim().length === 0) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return Response.json({ error: `${name} must be a positive integer` }, { status: 400 })
  }
  return parsed
}

function sortDirectionParam(params: URLSearchParams): "ascending" | "descending" | Response {
  const value = params.get("sortDirection")
  if (value === null || value.trim().length === 0) return "descending"
  if (value === "ascending" || value === "descending") return value
  return Response.json({ error: "sortDirection must be ascending or descending" }, { status: 400 })
}

function eventTypeParams(
  params: URLSearchParams,
): ReadonlyArray<DomainHistoryEventType> | Response {
  const values = [...params.getAll("eventType"), ...params.getAll("eventType[]")]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  const eventTypes = new Set<DomainHistoryEventType>()
  for (const value of values) {
    const mapped = localHistoryEventTypes(value)
    if (mapped === null) {
      return Response.json({ error: "eventType contains an unsupported value" }, { status: 400 })
    }
    for (const eventType of mapped) eventTypes.add(eventType)
  }
  return [...eventTypes]
}

function integerListParam(params: URLSearchParams, name: string): ReadonlyArray<number> | Response {
  const values = [...params.getAll(name), ...params.getAll(`${name}[]`)]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  if (values.length === 0) return []

  const ids = values.map((value) => Number(value))
  if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
    return Response.json({ error: `${name} must contain positive integers` }, { status: 400 })
  }
  return ids
}

function dateParam(params: URLSearchParams, name: string): Date | Response | null {
  const value = params.get(name)
  if (value === null || value.trim().length === 0) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return Response.json({ error: `${name} must be a valid date` }, { status: 400 })
  }
  return date
}

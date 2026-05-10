import { Effect } from "effect"

import { QueueService, type QueueItem } from "#/effect/services/QueueService"
import { runAuthedJson, runAuthedResponse } from "#/integrations/http/effect"

import { queuePagingResource, queueResource, queueStatusResource } from "./compatQueueResources"

interface RouteHandlerArgs {
  readonly request: Request
}

interface QueueQuery {
  readonly includeUnknownItems: boolean
  readonly page: number
  readonly pageSize: number
  readonly sortKey: string
  readonly sortDirection: "ascending" | "descending"
  readonly status: ReadonlyArray<string>
  readonly movieIds: ReadonlyArray<number>
  readonly seriesIds: ReadonlyArray<number>
  readonly episodeIds: ReadonlyArray<number>
}

export function listQueueHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const query = queueQueryFromRequest(request)
  if (query instanceof Response) return query

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const queue = yield* QueueService
      const items = filterQueueItems(yield* queue.list(), query)
      return queuePagingResource(items, query)
    }),
  )
}

export function listQueueDetailsHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const query = queueQueryFromRequest(request)
  if (query instanceof Response) return query

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const queue = yield* QueueService
      return filterQueueItems(yield* queue.list(), {
        ...query,
        includeUnknownItems: true,
      }).map(queueResource)
    }),
  )
}

export function getQueueStatusHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const queue = yield* QueueService
      return queueStatusResource(yield* queue.list())
    }),
  )
}

export function deleteQueueItemHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  const params = new URL(request.url).searchParams
  const removeFromClient = boolParam(params, "removeFromClient", true)
  if (removeFromClient instanceof Response) return removeFromClient
  const blocklist = boolParam(params, "blocklist", false)
  if (blocklist instanceof Response) return blocklist

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const queue = yield* QueueService
      if (blocklist) yield* queue.blocklist(id)
      yield* queue.remove(id, { deleteFiles: removeFromClient })
      return new Response(null, { status: 204 })
    }),
  )
}

function filterQueueItems(
  items: ReadonlyArray<QueueItem>,
  query: QueueQuery,
): ReadonlyArray<QueueItem> {
  return items
    .filter((item) => query.includeUnknownItems || item.media.type !== "unlinked")
    .filter(
      (item) =>
        query.status.length === 0 ||
        query.status.includes(item.status) ||
        (item.status === "importing" && query.status.includes("completed")),
    )
    .filter(
      (item) =>
        query.movieIds.length === 0 ||
        (item.media.type === "movie" &&
          item.media.id !== null &&
          query.movieIds.includes(item.media.id)),
    )
    .filter(
      (item) =>
        query.seriesIds.length === 0 ||
        (item.media.type === "series" &&
          item.media.id !== null &&
          query.seriesIds.includes(item.media.id)),
    )
    .filter(
      (item) =>
        query.episodeIds.length === 0 ||
        (item.media.episodeIds ?? []).some((id) => query.episodeIds.includes(id)),
    )
}

function queueQueryFromRequest(request: Request): QueueQuery | Response {
  const params = new URL(request.url).searchParams
  const page = positiveIntegerParam(params, "page", 1)
  if (page instanceof Response) return page
  const pageSize = positiveIntegerParam(params, "pageSize", 20)
  if (pageSize instanceof Response) return pageSize

  const sortDirection = sortDirectionParam(params)
  if (sortDirection instanceof Response) return sortDirection

  const status = statusParams(params)
  if (status instanceof Response) return status

  const movieIds = integerListParam(params, "movieIds")
  if (movieIds instanceof Response) return movieIds
  const seriesIds = integerListParam(params, "seriesIds")
  if (seriesIds instanceof Response) return seriesIds
  const episodeIds = integerListParam(params, "episodeIds")
  if (episodeIds instanceof Response) return episodeIds

  const includeUnknownMovieItems = boolParam(params, "includeUnknownMovieItems", false)
  if (includeUnknownMovieItems instanceof Response) return includeUnknownMovieItems
  const includeUnknownSeriesItems = boolParam(params, "includeUnknownSeriesItems", false)
  if (includeUnknownSeriesItems instanceof Response) return includeUnknownSeriesItems

  return {
    includeUnknownItems: includeUnknownMovieItems || includeUnknownSeriesItems,
    page,
    pageSize,
    sortKey: params.get("sortKey")?.trim() || "timeleft",
    sortDirection,
    status,
    movieIds,
    seriesIds,
    episodeIds,
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
    return Response.json({ error: "invalid queue item id" }, { status: 400 })
  }
  return id
}

function positiveIntegerParam(
  params: URLSearchParams,
  name: string,
  fallback: number,
): number | Response {
  const value = params.get(name)
  if (value === null || value.trim().length === 0) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return Response.json({ error: `${name} must be a positive integer` }, { status: 400 })
  }
  return parsed
}

function boolParam(params: URLSearchParams, name: string, fallback: boolean): boolean | Response {
  const value = params.get(name)
  if (value === null || value.trim().length === 0) return fallback
  if (value === "true" || value === "1") return true
  if (value === "false" || value === "0") return false
  return Response.json({ error: `${name} must be a boolean` }, { status: 400 })
}

function sortDirectionParam(params: URLSearchParams): "ascending" | "descending" | Response {
  const value = params.get("sortDirection")
  if (value === null || value.trim().length === 0) return "ascending"
  if (value === "ascending" || value === "descending") return value
  return Response.json({ error: "sortDirection must be ascending or descending" }, { status: 400 })
}

function statusParams(params: URLSearchParams): ReadonlyArray<string> | Response {
  const values = [...params.getAll("status"), ...params.getAll("status[]")]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  const statuses: Array<string> = []
  for (const value of values) {
    const status = localStatus(value)
    if (status === null) {
      return Response.json(
        { error: "status contains an unsupported queue status" },
        { status: 400 },
      )
    }
    statuses.push(status)
  }
  return statuses
}

function localStatus(value: string): string | null {
  switch (value) {
    case "completed":
    case "downloading":
    case "failed":
    case "importing":
    case "queued":
      return value
    case "warning":
      return "importing"
    default:
      return null
  }
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

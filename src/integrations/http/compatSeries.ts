import { Effect } from "effect"

import { ValidationError } from "#/effect/errors"
import { SeriesService } from "#/effect/services/SeriesService"
import { runAuthedJson, runAuthedResponse } from "#/integrations/http/effect"

import { seriesCreateInputFromBody, seriesUpdateInputFromBody } from "./compatSeriesInputs"
import { seriesResource } from "./compatSeriesResources"

interface RouteHandlerArgs {
  readonly request: Request
}

interface SeriesQuery {
  readonly status?: "continuing" | "ended" | "wanted" | "available"
  readonly monitored?: boolean
  readonly tvdbId?: number
}

export function listSeriesHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const query = seriesQueryFromRequest(request)
  if (query instanceof Response) return query

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const seriesService = yield* SeriesService
      const rows = yield* seriesService.list({
        ...(query.status ? { status: query.status } : {}),
        ...(query.monitored === undefined ? {} : { monitored: query.monitored }),
      })
      const filtered =
        query.tvdbId === undefined ? rows : rows.filter((series) => series.tvdbId === query.tvdbId)
      const details = yield* Effect.all(filtered.map((series) => seriesService.getById(series.id)))
      return details.map(seriesResource)
    }),
  )
}

export function getSeriesHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const seriesService = yield* SeriesService
      return seriesResource(yield* seriesService.getById(id))
    }),
  )
}

export function createSeriesHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const body = yield* jsonBody(request)
      const input = seriesCreateInputFromBody(body)
      if (input instanceof ValidationError) return yield* input

      const seriesService = yield* SeriesService
      const created = yield* seriesService.add(input)
      return Response.json(seriesResource(created), { status: 201 })
    }),
  )
}

export function updateSeriesHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const body = yield* jsonBody(request)
      const input = seriesUpdateInputFromBody(body)
      if (input instanceof ValidationError) return yield* input

      const seriesService = yield* SeriesService
      const updated = yield* seriesService.update(id, input)
      return Response.json(seriesResource(updated), { status: 202 })
    }),
  )
}

export function deleteSeriesHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const seriesService = yield* SeriesService
      yield* seriesService.remove(id)
      return new Response(null, { status: 204 })
    }),
  )
}

function jsonBody(request: Request) {
  return Effect.tryPromise({
    try: () => request.json(),
    catch: () => new ValidationError({ message: "invalid JSON body" }),
  })
}

function seriesQueryFromRequest(request: Request): SeriesQuery | Response {
  const params = new URL(request.url).searchParams
  const status = statusParam(params)
  if (status instanceof Response) return status
  const monitored = boolParam(params, "monitored", undefined)
  if (monitored instanceof Response) return monitored
  const tvdbId = positiveIntegerParam(params, "tvdbId", undefined)
  if (tvdbId instanceof Response) return tvdbId

  return {
    ...(status ? { status } : {}),
    ...(monitored === undefined ? {} : { monitored }),
    ...(tvdbId === undefined ? {} : { tvdbId }),
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
    return Response.json({ error: "invalid series id" }, { status: 400 })
  }
  return id
}

function statusParam(
  params: URLSearchParams,
): "continuing" | "ended" | "wanted" | "available" | Response | null {
  const value = params.get("status")
  if (value === null || value.trim().length === 0) return null
  if (value === "continuing" || value === "ended" || value === "wanted" || value === "available") {
    return value
  }
  return Response.json(
    { error: "status must be continuing, ended, wanted, or available" },
    { status: 400 },
  )
}

function boolParam(
  params: URLSearchParams,
  name: string,
  fallback: boolean | undefined,
): boolean | undefined | Response {
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

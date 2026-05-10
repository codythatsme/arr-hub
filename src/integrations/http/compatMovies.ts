import { Effect } from "effect"

import { ValidationError } from "#/effect/errors"
import { MovieService } from "#/effect/services/MovieService"
import { runAuthedJson, runAuthedResponse } from "#/integrations/http/effect"

import { movieCreateInputFromBody, movieUpdateInputFromBody } from "./compatMovieInputs"
import { movieResource } from "./compatWantedResources"

interface RouteHandlerArgs {
  readonly request: Request
}

interface MovieQuery {
  readonly status?: "wanted" | "available" | "missing"
  readonly monitored?: boolean
  readonly tmdbId?: number
}

export function listMoviesHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const query = movieQueryFromRequest(request)
  if (query instanceof Response) return query

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const movies = yield* MovieService
      const rows = yield* movies.list({
        ...(query.status ? { status: query.status } : {}),
        ...(query.monitored === undefined ? {} : { monitored: query.monitored }),
      })
      const filtered =
        query.tmdbId === undefined ? rows : rows.filter((movie) => movie.tmdbId === query.tmdbId)
      return filtered.map(movieResource)
    }),
  )
}

export function getMovieHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const movies = yield* MovieService
      return movieResource(yield* movies.getById(id))
    }),
  )
}

export function createMovieHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const body = yield* jsonBody(request)
      const input = movieCreateInputFromBody(body)
      if (input instanceof ValidationError) return yield* input

      const movies = yield* MovieService
      const created = yield* movies.add(input)
      return Response.json(movieResource(created), { status: 201 })
    }),
  )
}

export function updateMovieHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const body = yield* jsonBody(request)
      const input = movieUpdateInputFromBody(body)
      if (input instanceof ValidationError) return yield* input

      const movies = yield* MovieService
      const updated = yield* movies.update(id, input)
      return Response.json(movieResource(updated), { status: 202 })
    }),
  )
}

export function deleteMovieHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const movies = yield* MovieService
      yield* movies.remove(id)
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

function movieQueryFromRequest(request: Request): MovieQuery | Response {
  const params = new URL(request.url).searchParams
  const status = statusParam(params)
  if (status instanceof Response) return status
  const monitored = boolParam(params, "monitored", undefined)
  if (monitored instanceof Response) return monitored
  const tmdbId = positiveIntegerParam(params, "tmdbId", undefined)
  if (tmdbId instanceof Response) return tmdbId

  return {
    ...(status ? { status } : {}),
    ...(monitored === undefined ? {} : { monitored }),
    ...(tmdbId === undefined ? {} : { tmdbId }),
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
    return Response.json({ error: "invalid movie id" }, { status: 400 })
  }
  return id
}

function statusParam(
  params: URLSearchParams,
): "wanted" | "available" | "missing" | Response | null {
  const value = params.get("status")
  if (value === null || value.trim().length === 0) return null
  if (value === "wanted" || value === "available" || value === "missing") return value
  return Response.json({ error: "status must be wanted, available, or missing" }, { status: 400 })
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

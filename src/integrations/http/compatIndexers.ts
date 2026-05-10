import { Effect } from "effect"

import { ValidationError } from "#/effect/errors"
import { IndexerApplicationService } from "#/effect/services/IndexerApplicationService"
import { IndexerService } from "#/effect/services/IndexerService"
import { runAuthedJson, runAuthedResponse } from "#/integrations/http/effect"

import { indexerCreateInputFromBody, indexerUpdateInputFromBody } from "./compatIndexerInputs"
import { indexerResource } from "./compatIndexerResources"

interface RouteHandlerArgs {
  readonly request: Request
}

export function listIndexersHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const indexers = yield* IndexerService
      const rows = yield* indexers.list()
      return rows.map(indexerResource)
    }),
  )
}

export function getIndexerHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const indexers = yield* IndexerService
      return indexerResource(yield* indexers.getById(id))
    }),
  )
}

export function createIndexerHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const body = yield* jsonBody(request)
      const input = indexerCreateInputFromBody(body)
      if (input instanceof ValidationError) return yield* input

      const indexers = yield* IndexerService
      const created = yield* indexers.add(input)
      yield* syncEnabledIndexerApplications()
      return Response.json(indexerResource(created), { status: 201 })
    }),
  )
}

export function updateIndexerHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const body = yield* jsonBody(request)
      const input = indexerUpdateInputFromBody(body)
      if (input instanceof ValidationError) return yield* input

      const indexers = yield* IndexerService
      const updated = yield* indexers.update(id, input)
      yield* syncEnabledIndexerApplications()
      return Response.json(indexerResource(updated), { status: 202 })
    }),
  )
}

export function deleteIndexerHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const indexers = yield* IndexerService
      yield* indexers.remove(id)
      yield* syncEnabledIndexerApplications()
      return new Response(null, { status: 204 })
    }),
  )
}

function syncEnabledIndexerApplications() {
  return Effect.gen(function* () {
    const apps = yield* IndexerApplicationService
    yield* apps.syncEnabled().pipe(Effect.ignore)
  })
}

function jsonBody(request: Request) {
  return Effect.tryPromise({
    try: () => request.json(),
    catch: () => new ValidationError({ message: "invalid JSON body" }),
  })
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
    return Response.json({ error: "invalid indexer id" }, { status: 400 })
  }
  return id
}

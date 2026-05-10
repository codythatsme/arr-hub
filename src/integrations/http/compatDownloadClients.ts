import { Effect } from "effect"

import { ValidationError } from "#/effect/errors"
import { DownloadClientService } from "#/effect/services/DownloadClientService"
import { runAuthedJson, runAuthedResponse } from "#/integrations/http/effect"

import {
  downloadClientCreateInputFromBody,
  downloadClientUpdateInputFromBody,
} from "./compatDownloadClientInputs"
import { downloadClientResource } from "./compatDownloadClientResources"

interface RouteHandlerArgs {
  readonly request: Request
}

export function listDownloadClientsHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const clients = yield* DownloadClientService
      const rows = yield* clients.list()
      return rows.map(downloadClientResource)
    }),
  )
}

export function getDownloadClientHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const clients = yield* DownloadClientService
      return downloadClientResource(yield* clients.getById(id))
    }),
  )
}

export function createDownloadClientHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const body = yield* jsonBody(request)
      const input = downloadClientCreateInputFromBody(body)
      if (input instanceof ValidationError) return yield* input

      const clients = yield* DownloadClientService
      const created = yield* clients.add(input)
      return Response.json(downloadClientResource(created), { status: 201 })
    }),
  )
}

export function updateDownloadClientHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const body = yield* jsonBody(request)
      const input = downloadClientUpdateInputFromBody(body)
      if (input instanceof ValidationError) return yield* input

      const clients = yield* DownloadClientService
      const current = yield* clients.getById(id)
      const { settings, ...rest } = input
      const updated = yield* clients.update(id, {
        ...rest,
        ...(settings ? { settings: { ...current.settings, ...settings } } : {}),
      })
      return Response.json(downloadClientResource(updated), { status: 202 })
    }),
  )
}

export function deleteDownloadClientHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const clients = yield* DownloadClientService
      yield* clients.remove(id)
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

function validateCompatibleVersion(request: Request): Response | null {
  const version = new URL(request.url).pathname.split("/")[2]
  if (version === "v1" || version === "v3") return null
  return Response.json({ error: "unsupported api version" }, { status: 404 })
}

function idFromPath(request: Request): number | Response {
  const segment = new URL(request.url).pathname.split("/").at(-1)
  const id = Number(segment)
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: "invalid download client id" }, { status: 400 })
  }
  return id
}

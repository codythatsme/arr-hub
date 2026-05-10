import { Effect } from "effect"

import { RootFolderService } from "#/effect/services/RootFolderService"
import { runAuthedJson, runAuthedResponse } from "#/integrations/http/effect"

import {
  rootFolderInputFromCompatibleResource,
  rootFolderResource,
} from "./compatRootFoldersResources"

interface RouteHandlerArgs {
  readonly request: Request
}

export function listRootFoldersHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const rootFolders = yield* RootFolderService
      const rows = yield* rootFolders.list()
      return rows.map(rootFolderResource)
    }),
  )
}

export async function createRootFolderHandler({ request }: RouteHandlerArgs): Promise<Response> {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const body = await readBody(request)
  if (body instanceof Response) return body
  const input = rootFolderInputFromCompatibleResource(body)
  if ("error" in input) return Response.json({ error: input.error }, { status: 400 })

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const rootFolders = yield* RootFolderService
      const created = yield* rootFolders.add(input)
      return Response.json(rootFolderResource(created), { status: 201 })
    }),
  )
}

export function getRootFolderHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const rootFolders = yield* RootFolderService
      return rootFolderResource(yield* rootFolders.getById(id))
    }),
  )
}

export function deleteRootFolderHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const rootFolders = yield* RootFolderService
      yield* rootFolders.remove(id)
      return new Response(null, { status: 204 })
    }),
  )
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
    return Response.json({ error: "invalid root folder id" }, { status: 400 })
  }
  return id
}

async function readBody(request: Request): Promise<unknown | Response> {
  const body = await request.json().catch(() => null)
  if (body === null) return Response.json({ error: "invalid json body" }, { status: 400 })
  return body
}

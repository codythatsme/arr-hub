import { Effect } from "effect"

import { TagService, type TagDetails, type TagSummary } from "#/effect/services/TagService"
import { runAuthedJson, runAuthedResponse } from "#/integrations/http/effect"

interface RouteHandlerArgs {
  readonly request: Request
}

interface TagBody {
  readonly label?: unknown
}

interface CompatibleTagResource {
  readonly id: number
  readonly label: string
}

interface CompatibleTagDetailResource {
  readonly id: number
  readonly label: string
  readonly delayProfileIds: ReadonlyArray<number>
  readonly importListIds: ReadonlyArray<number>
  readonly notificationIds: ReadonlyArray<number>
  readonly restrictionIds: ReadonlyArray<number>
  readonly releaseProfileIds: ReadonlyArray<number>
  readonly excludedReleaseProfileIds: ReadonlyArray<number>
  readonly indexerIds: ReadonlyArray<number>
  readonly downloadClientIds: ReadonlyArray<number>
  readonly autoTagIds: ReadonlyArray<number>
  readonly seriesIds: ReadonlyArray<number>
  readonly movieIds: ReadonlyArray<number>
  readonly indexerProxyIds: ReadonlyArray<number>
  readonly applicationIds: ReadonlyArray<number>
}

export function listTagsHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const tags = yield* TagService
      const rows = yield* tags.list()
      return rows.map(tagResource)
    }),
  )
}

export async function createTagHandler({ request }: RouteHandlerArgs): Promise<Response> {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const label = await readLabel(request)
  if (label instanceof Response) return label

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const tags = yield* TagService
      const created = yield* tags.create(label)
      return Response.json(tagResource(created), { status: 201 })
    }),
  )
}

export function getTagHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const tags = yield* TagService
      return tagResource(yield* tags.get(id))
    }),
  )
}

export async function updateTagHandler({ request }: RouteHandlerArgs): Promise<Response> {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  const label = await readLabel(request)
  if (label instanceof Response) return label

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const tags = yield* TagService
      const updated = yield* tags.update(id, label)
      return Response.json(tagResource(updated), { status: 202 })
    }),
  )
}

export function deleteTagHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const tags = yield* TagService
      yield* tags.remove(id)
      return new Response(null, { status: 204 })
    }),
  )
}

export function listTagDetailsHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const tags = yield* TagService
      const rows = yield* tags.detailsList()
      return rows.map(tagDetailResource)
    }),
  )
}

export function getTagDetailsHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const tags = yield* TagService
      return tagDetailResource(yield* tags.details(id))
    }),
  )
}

function tagResource(summary: TagSummary): CompatibleTagResource {
  return {
    id: summary.tag.id,
    label: summary.tag.label,
  }
}

function tagDetailResource(details: TagDetails): CompatibleTagDetailResource {
  return {
    id: details.id,
    label: details.label,
    delayProfileIds: details.delayProfileIds,
    importListIds: details.importListIds,
    notificationIds: details.notificationIds,
    restrictionIds: details.restrictionIds,
    releaseProfileIds: details.releaseProfileIds,
    excludedReleaseProfileIds: details.excludedReleaseProfileIds,
    indexerIds: details.indexerIds,
    downloadClientIds: details.downloadClientIds,
    autoTagIds: details.autoTagIds,
    seriesIds: details.seriesIds,
    movieIds: details.movieIds,
    indexerProxyIds: details.indexerProxyIds,
    applicationIds: details.applicationIds,
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
    return Response.json({ error: "invalid tag id" }, { status: 400 })
  }
  return id
}

async function readLabel(request: Request): Promise<string | Response> {
  const body = (await request.json().catch(() => null)) as TagBody | null
  if (!body || typeof body.label !== "string") {
    return Response.json({ error: "label is required" }, { status: 400 })
  }
  return body.label
}

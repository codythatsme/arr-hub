import type { SqlError } from "@effect/sql/SqlError"
import { Effect } from "effect"

import { customFormats } from "#/db/schema"
import { Db } from "#/effect/services/Db"
import { ProfileService } from "#/effect/services/ProfileService"
import { runAuthedJson, runAuthedResponse } from "#/integrations/http/effect"

import {
  profileInputFromCompatibleResource,
  profileUpdateFromCompatibleResource,
  qualityProfileResource,
} from "./compatQualityProfilesResources"

interface RouteHandlerArgs {
  readonly request: Request
}

export function listQualityProfilesHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const profiles = yield* ProfileService
      const formatNames = yield* loadCustomFormatNames()
      const rows = yield* profiles.list()
      return rows.map((profile) => qualityProfileResource(profile, formatNames))
    }),
  )
}

export async function createQualityProfileHandler({
  request,
}: RouteHandlerArgs): Promise<Response> {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const body = await readBody(request)
  if (body instanceof Response) return body
  const input = profileInputFromCompatibleResource(body)
  if ("error" in input) return Response.json({ error: input.error }, { status: 400 })

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const profiles = yield* ProfileService
      const formatNames = yield* loadCustomFormatNames()
      const created = yield* profiles.create(input)
      return Response.json(qualityProfileResource(created, formatNames), { status: 201 })
    }),
  )
}

export function getQualityProfileHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const profiles = yield* ProfileService
      const formatNames = yield* loadCustomFormatNames()
      const profile = yield* profiles.getById(id)
      return qualityProfileResource(profile, formatNames)
    }),
  )
}

export async function updateQualityProfileHandler({
  request,
}: RouteHandlerArgs): Promise<Response> {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  const body = await readBody(request)
  if (body instanceof Response) return body
  const input = profileUpdateFromCompatibleResource(body)
  if ("error" in input) return Response.json({ error: input.error }, { status: 400 })

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const profiles = yield* ProfileService
      const formatNames = yield* loadCustomFormatNames()
      const updated = yield* profiles.update(id, input)
      return Response.json(qualityProfileResource(updated, formatNames), { status: 202 })
    }),
  )
}

export function deleteQualityProfileHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const profiles = yield* ProfileService
      yield* profiles.remove(id)
      return new Response(null, { status: 204 })
    }),
  )
}

function loadCustomFormatNames(): Effect.Effect<ReadonlyMap<number, string>, SqlError, Db> {
  return Effect.gen(function* () {
    const db = yield* Db
    const rows = yield* db
      .select({ id: customFormats.id, name: customFormats.name })
      .from(customFormats)
    return new Map(rows.map((row) => [row.id, row.name]))
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
    return Response.json({ error: "invalid quality profile id" }, { status: 400 })
  }
  return id
}

async function readBody(request: Request): Promise<unknown | Response> {
  const body = await request.json().catch(() => null)
  if (body === null) return Response.json({ error: "invalid json body" }, { status: 400 })
  return body
}

import { and, eq, ne } from "drizzle-orm"
import { Effect } from "effect"

import { customFormats, customFormatSpecs } from "#/db/schema"
import { ConflictError, NotFoundError } from "#/effect/errors"
import { Db } from "#/effect/services/Db"
import { runAuthedJson, runAuthedResponse } from "#/integrations/http/effect"

import {
  customFormatInputFromCompatibleResource,
  customFormatResource,
  customFormatUpdateFromCompatibleResource,
  type CustomFormatInput,
  type CustomFormatLike,
  type CustomFormatUpdate,
} from "./compatCustomFormatsResources"

interface RouteHandlerArgs {
  readonly request: Request
}

export function listCustomFormatsHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const rows = yield* listCustomFormats()
      return rows.map(customFormatResource)
    }),
  )
}

export async function createCustomFormatHandler({ request }: RouteHandlerArgs): Promise<Response> {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const body = await readBody(request)
  if (body instanceof Response) return body
  const input = customFormatInputFromCompatibleResource(body)
  if ("error" in input) return Response.json({ error: input.error }, { status: 400 })

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const created = yield* createCustomFormat(input)
      return Response.json(customFormatResource(created), { status: 201 })
    }),
  )
}

export function getCustomFormatHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      return customFormatResource(yield* getCustomFormatById(id))
    }),
  )
}

export async function updateCustomFormatHandler({ request }: RouteHandlerArgs): Promise<Response> {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  const body = await readBody(request)
  if (body instanceof Response) return body
  const input = customFormatUpdateFromCompatibleResource(body)
  if ("error" in input) return Response.json({ error: input.error }, { status: 400 })

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const updated = yield* updateCustomFormat(id, input)
      return Response.json(customFormatResource(updated), { status: 202 })
    }),
  )
}

export function deleteCustomFormatHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      yield* deleteCustomFormat(id)
      return new Response(null, { status: 204 })
    }),
  )
}

function listCustomFormats() {
  return Effect.gen(function* () {
    const db = yield* Db
    const formats = yield* db.select().from(customFormats)
    const specs = yield* db.select().from(customFormatSpecs)

    return formats.map((format) => ({
      format,
      specs: specs.filter((spec) => spec.customFormatId === format.id),
    }))
  })
}

function getCustomFormatById(id: number) {
  return Effect.gen(function* () {
    const db = yield* Db
    const [format] = yield* db.select().from(customFormats).where(eq(customFormats.id, id))
    if (!format) return yield* new NotFoundError({ entity: "customFormat", id })

    const specs = yield* db
      .select()
      .from(customFormatSpecs)
      .where(eq(customFormatSpecs.customFormatId, id))
    return { format, specs } satisfies CustomFormatLike
  })
}

function createCustomFormat(input: CustomFormatInput) {
  return Effect.gen(function* () {
    const db = yield* Db
    yield* assertUniqueName(input.name)

    const [format] = yield* db
      .insert(customFormats)
      .values({ name: input.name, includeWhenRenaming: input.includeWhenRenaming })
      .returning()

    yield* insertSpecs(format.id, input.specs)
    return yield* getCustomFormatById(format.id)
  })
}

function updateCustomFormat(id: number, input: CustomFormatUpdate) {
  return Effect.gen(function* () {
    const db = yield* Db
    yield* getCustomFormatById(id)

    if (input.name !== undefined) {
      yield* assertUniqueName(input.name, id)
    }

    const updateSet: Record<string, unknown> = {}
    if (input.name !== undefined) updateSet.name = input.name
    if (input.includeWhenRenaming !== undefined) {
      updateSet.includeWhenRenaming = input.includeWhenRenaming
    }

    if (Object.keys(updateSet).length > 0) {
      yield* db.update(customFormats).set(updateSet).where(eq(customFormats.id, id))
    }

    if (input.specs !== undefined) {
      yield* db.delete(customFormatSpecs).where(eq(customFormatSpecs.customFormatId, id))
      yield* insertSpecs(id, input.specs)
    }

    return yield* getCustomFormatById(id)
  })
}

function deleteCustomFormat(id: number) {
  return Effect.gen(function* () {
    const db = yield* Db
    const rows = yield* db
      .delete(customFormats)
      .where(eq(customFormats.id, id))
      .returning({ id: customFormats.id })
    if (rows.length === 0) return yield* new NotFoundError({ entity: "customFormat", id })
  })
}

function assertUniqueName(name: string, excludeId?: number) {
  return Effect.gen(function* () {
    const db = yield* Db
    const where =
      excludeId === undefined
        ? eq(customFormats.name, name)
        : and(eq(customFormats.name, name), ne(customFormats.id, excludeId))
    const existing = yield* db.select({ id: customFormats.id }).from(customFormats).where(where)
    if (existing.length > 0) {
      return yield* new ConflictError({ entity: "customFormat", field: "name", value: name })
    }
  })
}

function insertSpecs(id: number, specs: CustomFormatInput["specs"]) {
  if (specs.length === 0) return Effect.void
  return Effect.gen(function* () {
    const db = yield* Db
    yield* db.insert(customFormatSpecs).values(
      specs.map((spec) => ({
        customFormatId: id,
        name: spec.name,
        field: spec.field,
        pattern: spec.pattern,
        negate: spec.negate,
        required: spec.required,
      })),
    )
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
    return Response.json({ error: "invalid custom format id" }, { status: 400 })
  }
  return id
}

async function readBody(request: Request): Promise<unknown | Response> {
  const body = await request.json().catch(() => null)
  if (body === null) return Response.json({ error: "invalid json body" }, { status: 400 })
  return body
}

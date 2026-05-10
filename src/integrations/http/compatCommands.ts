import type { SQL } from "drizzle-orm"
import { and, desc, eq, inArray } from "drizzle-orm"
import { Effect } from "effect"

import { schedulerJobs, seasons } from "#/db/schema"
import {
  dedupeKey,
  type SchedulerJobPayload,
  type SchedulerJobType,
} from "#/effect/domain/scheduler"
import { NotFoundError, ValidationError } from "#/effect/errors"
import { Db } from "#/effect/services/Db"
import { SchedulerService } from "#/effect/services/SchedulerService"
import { runAuthedJson, runAuthedResponse } from "#/integrations/http/effect"

import {
  commandPayloadSpecsFromBody,
  normalizeCommandName,
  type CommandPayloadSpec,
} from "./compatCommandPayloads"
import { commandResource, type SchedulerJobRow } from "./compatCommandsResources"

interface RouteHandlerArgs {
  readonly request: Request
}

const SCHEDULER_JOB_TYPES: ReadonlySet<SchedulerJobType> = new Set([
  "rss_sync",
  "search_missing",
  "search_cutoff",
  "download_monitor",
  "indexer_definition_refresh",
  "indexer_application_sync",
  "movie_metadata_refresh",
  "series_metadata_refresh",
  "database_backup",
  "housekeeping",
  "tv_rss_sync",
  "tv_search_cutoff",
  "tv_search_series",
  "tv_search_season",
  "tv_search_episode",
])

export function listCommandsHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const query = commandQueryFromRequest(request)
  if (query instanceof Response) return query

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const db = yield* Db
      const where = whereForCommandQuery(query)
      const rows = yield* db
        .select()
        .from(schedulerJobs)
        .where(where)
        .orderBy(desc(schedulerJobs.createdAt))
      return rows.map(commandResource)
    }),
  )
}

export function getCommandHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      return commandResource(yield* loadCommand(id))
    }),
  )
}

export function createCommandHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const body = yield* Effect.tryPromise({
        try: () => request.json(),
        catch: () => new ValidationError({ message: "invalid JSON body" }),
      })
      const specs = commandPayloadSpecsFromBody(body)
      if (specs instanceof ValidationError) return yield* specs

      const payloads: Array<SchedulerJobPayload> = []
      for (const spec of specs) {
        payloads.push(yield* resolvePayloadSpec(spec))
      }

      const scheduler = yield* SchedulerService
      let firstJob: SchedulerJobRow | null = null

      for (const payload of payloads) {
        const enqueued = yield* scheduler.enqueue(payload)
        const job = enqueued ?? (yield* loadActiveCommandByDedupeKey(dedupeKey(payload)))
        firstJob ??= job
      }

      if (!firstJob) {
        return yield* new ValidationError({ message: "command did not create a scheduler job" })
      }

      return Response.json(commandResource(firstJob), { status: 201 })
    }),
  )
}

export function deleteCommandHandler({ request }: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  const id = idFromPath(request)
  if (id instanceof Response) return id

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const db = yield* Db
      const command = yield* loadCommand(id)

      if (command.status === "running") {
        return yield* new ValidationError({
          message: "running commands cannot be cancelled by this scheduler adapter",
        })
      }

      yield* db.delete(schedulerJobs).where(eq(schedulerJobs.id, id))
      return new Response(null, { status: 204 })
    }),
  )
}

function resolvePayloadSpec(spec: CommandPayloadSpec) {
  return Effect.gen(function* () {
    if (spec._tag !== "tv_search_season_by_number") return spec

    const db = yield* Db
    const rows = yield* db
      .select({ id: seasons.id })
      .from(seasons)
      .where(and(eq(seasons.seriesId, spec.seriesId), eq(seasons.seasonNumber, spec.seasonNumber)))
      .limit(1)

    const season = rows[0]
    if (!season) {
      return yield* new NotFoundError({
        entity: "season",
        id: `${spec.seriesId}/${spec.seasonNumber}`,
      })
    }

    return { _tag: "tv_search_season", seasonId: season.id } satisfies SchedulerJobPayload
  })
}

function loadCommand(id: number) {
  return Effect.gen(function* () {
    const db = yield* Db
    const rows = yield* db.select().from(schedulerJobs).where(eq(schedulerJobs.id, id)).limit(1)
    const row = rows[0]
    if (!row) return yield* new NotFoundError({ entity: "command", id })
    return row
  })
}

function loadActiveCommandByDedupeKey(key: string) {
  return Effect.gen(function* () {
    const db = yield* Db
    const rows = yield* db
      .select()
      .from(schedulerJobs)
      .where(
        and(
          eq(schedulerJobs.dedupeKey, key),
          inArray(schedulerJobs.status, ["pending", "running"]),
        ),
      )
      .orderBy(desc(schedulerJobs.createdAt))
      .limit(1)
    return rows[0] ?? null
  })
}

function whereForCommandQuery(query: CommandQuery): SQL | undefined {
  const filters: Array<SQL> = []
  if (query.status.length > 0) filters.push(inArray(schedulerJobs.status, [...query.status]))
  if (query.jobType.length > 0) filters.push(inArray(schedulerJobs.jobType, [...query.jobType]))
  return filters.length > 0 ? and(...filters) : undefined
}

interface CommandQuery {
  readonly status: ReadonlyArray<(typeof schedulerJobs.$inferSelect)["status"]>
  readonly jobType: ReadonlyArray<(typeof schedulerJobs.$inferSelect)["jobType"]>
}

function commandQueryFromRequest(request: Request): CommandQuery | Response {
  const params = new URL(request.url).searchParams
  const status = localStatusParams(params)
  if (status instanceof Response) return status
  const jobType = localJobTypeParams(params)
  if (jobType instanceof Response) return jobType
  return { status, jobType }
}

function localJobTypeParams(
  params: URLSearchParams,
): ReadonlyArray<(typeof schedulerJobs.$inferSelect)["jobType"]> | Response {
  const values = stringListParam(params, "jobType")
  const jobTypes = new Set<SchedulerJobType>()
  for (const value of values) {
    if (!SCHEDULER_JOB_TYPES.has(value as SchedulerJobType)) {
      return Response.json({ error: "jobType contains an unsupported value" }, { status: 400 })
    }
    jobTypes.add(value as SchedulerJobType)
  }
  return [...jobTypes]
}

function localStatusParams(
  params: URLSearchParams,
): ReadonlyArray<(typeof schedulerJobs.$inferSelect)["status"]> | Response {
  const values = stringListParam(params, "status")
  const statuses = new Set<(typeof schedulerJobs.$inferSelect)["status"]>()
  for (const value of values) {
    switch (normalizeCommandName(value)) {
      case "queued":
      case "pending":
        statuses.add("pending")
        break
      case "started":
      case "running":
        statuses.add("running")
        break
      case "completed":
        statuses.add("completed")
        break
      case "failed":
        statuses.add("failed")
        statuses.add("dead")
        break
      case "dead":
        statuses.add("dead")
        break
      default:
        return Response.json({ error: "status contains an unsupported value" }, { status: 400 })
    }
  }
  return [...statuses]
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
    return Response.json({ error: "invalid command id" }, { status: 400 })
  }
  return id
}

function stringListParam(params: URLSearchParams, name: string): ReadonlyArray<string> {
  return [...params.getAll(name), ...params.getAll(`${name}[]`)]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

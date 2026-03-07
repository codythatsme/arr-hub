import { SqlError } from "@effect/sql/SqlError"
import { initTRPC, TRPCError } from "@trpc/server"
import { Cause, Effect, Exit, Option, type ManagedRuntime } from "effect"
import superjson from "superjson"

import type {
  AcquisitionError,
  AuthError,
  BundleNotFoundError,
  BundleVersionConflictError,
  ConflictError,
  DownloadClientError,
  EncryptionError,
  IndexerError,
  MediaServerError,
  MetadataError,
  NotFoundError,
  ParseFailed,
  ProfileInUseError,
  SchedulerError,
  ValidationError,
} from "#/effect/errors"
import { AppRuntime } from "#/effect/runtime"
import { AuthService } from "#/effect/services/AuthService"

type AppContext =
  typeof AppRuntime extends ManagedRuntime.ManagedRuntime<infer R, infer _E> ? R : never

export interface TRPCContext {
  headers: Headers
  userId: number | null
}

export function createContext({ request }: { request: Request }): TRPCContext {
  return { headers: request.headers, userId: null }
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
})

export const createTRPCRouter = t.router

export const publicProcedure = t.procedure

type DomainError =
  | NotFoundError
  | ValidationError
  | ConflictError
  | AuthError
  | ProfileInUseError
  | BundleNotFoundError
  | BundleVersionConflictError
  | IndexerError
  | DownloadClientError
  | MediaServerError
  | EncryptionError
  | ParseFailed
  | SchedulerError
  | AcquisitionError
  | MetadataError

export function domainToTRPC(error: DomainError): TRPCError {
  switch (error._tag) {
    case "NotFoundError":
      return new TRPCError({ code: "NOT_FOUND", message: `${error.entity} ${error.id} not found` })
    case "ValidationError":
      return new TRPCError({ code: "BAD_REQUEST", message: error.message })
    case "ConflictError":
      return new TRPCError({
        code: "CONFLICT",
        message: `${error.entity} with ${error.field}=${error.value} already exists`,
      })
    case "AuthError":
      return new TRPCError({ code: "UNAUTHORIZED", message: error.reason })
    case "ProfileInUseError":
      return new TRPCError({
        code: "CONFLICT",
        message: `profile ${error.profileId} in use by ${error.movieCount} movie(s) and ${error.seriesCount} series`,
      })
    case "BundleNotFoundError":
      return new TRPCError({ code: "NOT_FOUND", message: `bundle ${error.bundleId} not found` })
    case "BundleVersionConflictError":
      return new TRPCError({
        code: "CONFLICT",
        message: `bundle ${error.bundleId} v${error.appliedVersion} already applied`,
      })
    case "IndexerError": {
      const codeMap: Record<string, TRPCError["code"]> = {
        auth_failed: "UNAUTHORIZED",
        search_timeout: "TIMEOUT",
        rate_limited: "TOO_MANY_REQUESTS",
        connection_failed: "BAD_GATEWAY",
        invalid_response: "BAD_GATEWAY",
      }
      return new TRPCError({
        code: codeMap[error.reason] ?? "BAD_GATEWAY",
        message: `[${error.indexerName}] ${error.message}`,
      })
    }
    case "DownloadClientError": {
      const codeMap: Record<string, TRPCError["code"]> = {
        auth_failed: "UNAUTHORIZED",
        connection_refused: "BAD_GATEWAY",
        timeout: "TIMEOUT",
        category_create_failed: "BAD_GATEWAY",
        download_rejected: "BAD_REQUEST",
        invalid_response: "BAD_GATEWAY",
      }
      return new TRPCError({
        code: codeMap[error.reason] ?? "BAD_GATEWAY",
        message: `[${error.clientName}] ${error.message}`,
      })
    }
    case "MediaServerError": {
      const codeMap: Record<string, TRPCError["code"]> = {
        auth_failed: "UNAUTHORIZED",
        connection_refused: "BAD_GATEWAY",
        timeout: "TIMEOUT",
        library_not_found: "NOT_FOUND",
        sync_failed: "BAD_GATEWAY",
        invalid_response: "BAD_GATEWAY",
      }
      return new TRPCError({
        code: codeMap[error.reason] ?? "BAD_GATEWAY",
        message: `[${error.serverName}] ${error.message}`,
      })
    }
    case "EncryptionError":
      return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message })
    case "ParseFailed":
      return new TRPCError({ code: "BAD_REQUEST", message: `parse failed: ${error.title}` })
    case "SchedulerError": {
      const codeMap: Record<string, TRPCError["code"]> = {
        duplicate_job: "CONFLICT",
        invalid_transition: "BAD_REQUEST",
        paused: "PRECONDITION_FAILED",
      }
      return new TRPCError({
        code: codeMap[error.reason] ?? "BAD_REQUEST",
        message: error.message,
      })
    }
    case "AcquisitionError":
      return new TRPCError({
        code: "BAD_REQUEST",
        message: `[movie:${error.movieId}] ${error.stage}: ${error.message}`,
      })
    case "MetadataError": {
      const codeMap: Record<string, TRPCError["code"]> = {
        api_key_missing: "UNAUTHORIZED",
        not_found: "NOT_FOUND",
        rate_limited: "TOO_MANY_REQUESTS",
        request_failed: "BAD_GATEWAY",
      }
      return new TRPCError({
        code: codeMap[error.reason] ?? "BAD_GATEWAY",
        message: `[${error.provider}] ${error.message}`,
      })
    }
  }
}

/** Run an Effect through AppRuntime, mapping domain/sql errors → TRPCError thrown directly. */
export async function runEffect<A>(
  effect: Effect.Effect<A, DomainError | SqlError, AppContext>,
): Promise<A> {
  const exit = await AppRuntime.runPromise(Effect.exit(effect))
  if (Exit.isSuccess(exit)) return exit.value

  const failure = Cause.failureOption(exit.cause)
  if (Option.isSome(failure)) {
    const e = failure.value
    if (e._tag === "SqlError") {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message })
    }
    throw domainToTRPC(e)
  }
  // Defect or interruption
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "unexpected error" })
}

export const authedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const authHeader = ctx.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "missing" })
  }

  const token = authHeader.slice(7)
  const validated = await runEffect(
    Effect.gen(function* () {
      const auth = yield* AuthService
      return yield* auth.validateToken(token)
    }),
  )

  return next({ ctx: { ...ctx, userId: validated.userId } })
})

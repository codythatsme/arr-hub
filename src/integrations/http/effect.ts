import { SqlError } from "@effect/sql/SqlError"
import { TRPCError } from "@trpc/server"
import { Effect } from "effect"

import { AppRuntime } from "#/effect/runtime"
import { AuthService } from "#/effect/services/AuthService"
import type { DomainError } from "#/integrations/trpc/init"
import { domainToTRPC } from "#/integrations/trpc/init"

import { authTokenFromRequest } from "./auth"

type AppContext =
  Parameters<typeof AppRuntime.runPromise>[0] extends Effect.Effect<unknown, unknown, infer R>
    ? R
    : never

function errorResponse(error: unknown): Response {
  if (error instanceof TRPCError) {
    return Response.json({ error: error.message }, { status: trpcStatus(error.code) })
  }
  return Response.json({ error: "unexpected error" }, { status: 500 })
}

export async function runAuthedJson<A>(
  request: Request,
  effect: Effect.Effect<A, DomainError | SqlError, AppContext>,
): Promise<Response> {
  const token = authTokenFromRequest(request)
  if (!token) {
    return Response.json({ error: "missing" }, { status: 401 })
  }

  try {
    const data = await AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        yield* auth.validateToken(token)
        return yield* effect
      }),
    )
    return Response.json(data)
  } catch (error) {
    if (typeof error === "object" && error !== null && "_tag" in error) {
      if (error._tag === "SqlError") {
        return Response.json({ error: "database error" }, { status: 500 })
      }
      return errorResponse(domainToTRPC(error as DomainError))
    }
    return errorResponse(error)
  }
}

export async function runAuthedResponse(
  request: Request,
  effect: Effect.Effect<Response, DomainError | SqlError, AppContext>,
): Promise<Response> {
  const token = authTokenFromRequest(request)
  if (!token) {
    return Response.json({ error: "missing" }, { status: 401 })
  }

  try {
    return await AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        yield* auth.validateToken(token)
        return yield* effect
      }),
    )
  } catch (error) {
    if (typeof error === "object" && error !== null && "_tag" in error) {
      if (error._tag === "SqlError") {
        return Response.json({ error: "database error" }, { status: 500 })
      }
      return errorResponse(domainToTRPC(error as DomainError))
    }
    return errorResponse(error)
  }
}

export async function runJson<A>(
  effect: Effect.Effect<A, DomainError | SqlError, AppContext>,
): Promise<Response> {
  try {
    const data = await AppRuntime.runPromise(effect)
    return Response.json(data)
  } catch (error) {
    if (typeof error === "object" && error !== null && "_tag" in error) {
      if (error._tag === "SqlError") {
        return Response.json({ error: "database error" }, { status: 500 })
      }
      return errorResponse(domainToTRPC(error as DomainError))
    }
    return errorResponse(error)
  }
}

function trpcStatus(code: TRPCError["code"]): number {
  switch (code) {
    case "BAD_REQUEST":
      return 400
    case "UNAUTHORIZED":
      return 401
    case "FORBIDDEN":
      return 403
    case "NOT_FOUND":
      return 404
    case "TIMEOUT":
      return 408
    case "CONFLICT":
      return 409
    case "PRECONDITION_FAILED":
      return 412
    case "TOO_MANY_REQUESTS":
      return 429
    case "BAD_GATEWAY":
      return 502
    default:
      return 500
  }
}

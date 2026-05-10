import { Effect } from "effect"

import { DiagnosticsService } from "#/effect/services/DiagnosticsService"
import { runAuthedJson } from "#/integrations/http/effect"

import { healthResources, systemStatusResource } from "./compatSystemResources"

interface RouteHandlerArgs {
  readonly request: Request
}

export function compatibleSystemStatusHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const diagnostics = yield* DiagnosticsService
      const status = yield* diagnostics.status()
      return systemStatusResource(status)
    }),
  )
}

export function compatibleHealthHandler({
  request,
}: RouteHandlerArgs): Promise<Response> | Response {
  const versionError = validateCompatibleVersion(request)
  if (versionError) return versionError

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const diagnostics = yield* DiagnosticsService
      const health = yield* diagnostics.health()
      return healthResources(health)
    }),
  )
}

function validateCompatibleVersion(request: Request): Response | null {
  const version = new URL(request.url).pathname.split("/")[2]
  if (version === "v1" || version === "v3") return null
  return Response.json({ error: "unsupported api version" }, { status: 404 })
}

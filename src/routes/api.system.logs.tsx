import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"

import { DiagnosticsService, type LogLevel } from "#/effect/services/DiagnosticsService"
import { runAuthedJson } from "#/integrations/http/effect"

function handler({ request }: { request: Request }) {
  const url = new URL(request.url)
  const level = url.searchParams.get("level")
  const count = Number(url.searchParams.get("count") ?? "100")

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const diagnostics = yield* DiagnosticsService
      return yield* diagnostics.logs({
        level: isLogLevel(level) ? level : undefined,
        count: Number.isFinite(count) ? count : 100,
      })
    }),
  )
}

function isLogLevel(value: string | null): value is LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error"
}

export const Route = createFileRoute("/api/system/logs")({
  server: { handlers: { GET: handler } },
})

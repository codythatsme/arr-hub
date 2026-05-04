import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"

import { DiagnosticsService } from "#/effect/services/DiagnosticsService"
import { runAuthedJson } from "#/integrations/http/effect"

function handler({ request }: { request: Request }) {
  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const diagnostics = yield* DiagnosticsService
      return yield* diagnostics.status()
    }),
  )
}

export const Route = createFileRoute("/api/system/status")({
  server: { handlers: { GET: handler } },
})

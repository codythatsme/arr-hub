import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"

import { DiagnosticsService } from "#/effect/services/DiagnosticsService"
import { runAuthedJson } from "#/integrations/http/effect"

function handler({ request }: { request: Request }) {
  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const diagnostics = yield* DiagnosticsService
      return yield* diagnostics.health()
    }),
  )
}

export const Route = createFileRoute("/api/system/health")({
  server: { handlers: { GET: handler } },
})

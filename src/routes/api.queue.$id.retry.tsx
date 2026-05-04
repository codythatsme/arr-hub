import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"

import { QueueService } from "#/effect/services/QueueService"
import { runAuthedJson } from "#/integrations/http/effect"

function handler({ request }: { request: Request }) {
  const id = Number(new URL(request.url).pathname.split("/").at(-2))
  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const queue = yield* QueueService
      return yield* queue.retry(id)
    }),
  )
}

export const Route = createFileRoute("/api/queue/$id/retry")({
  server: { handlers: { POST: handler } },
})

import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"

import { QueueService } from "#/effect/services/QueueService"
import { runAuthedJson } from "#/integrations/http/effect"

async function handler({ request }: { request: Request }) {
  const id = Number(new URL(request.url).pathname.split("/").at(-2))
  const body = request.headers.get("content-type")?.includes("application/json")
    ? ((await request.json()) as { deleteFiles?: boolean })
    : {}

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const queue = yield* QueueService
      yield* queue.remove(id, { deleteFiles: body.deleteFiles })
      return { ok: true }
    }),
  )
}

export const Route = createFileRoute("/api/queue/$id/remove")({
  server: { handlers: { POST: handler } },
})

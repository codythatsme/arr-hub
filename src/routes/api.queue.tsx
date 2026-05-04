import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"

import {
  QueueService,
  type QueueMediaTypeFilter,
  type QueueStatusFilter,
} from "#/effect/services/QueueService"
import { runAuthedJson } from "#/integrations/http/effect"

function handler({ request }: { request: Request }) {
  const url = new URL(request.url)
  const status = url.searchParams.get("status")
  const mediaType = url.searchParams.get("mediaType")
  const clientId = Number(url.searchParams.get("clientId"))

  return runAuthedJson(
    request,
    Effect.gen(function* () {
      const queue = yield* QueueService
      return yield* queue.list({
        status: isStatus(status) ? status : undefined,
        mediaType: isMediaType(mediaType) ? mediaType : undefined,
        clientId: Number.isInteger(clientId) ? clientId : undefined,
      })
    }),
  )
}

function isStatus(value: string | null): value is QueueStatusFilter {
  return (
    value === "all" ||
    value === "queued" ||
    value === "downloading" ||
    value === "importing" ||
    value === "completed" ||
    value === "failed"
  )
}

function isMediaType(value: string | null): value is QueueMediaTypeFilter {
  return value === "all" || value === "movie" || value === "series" || value === "unlinked"
}

export const Route = createFileRoute("/api/queue")({
  server: { handlers: { GET: handler } },
})

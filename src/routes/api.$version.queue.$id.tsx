import { createFileRoute } from "@tanstack/react-router"

import { deleteQueueItemHandler } from "#/integrations/http/compatQueue"

export const Route = createFileRoute("/api/$version/queue/$id")({
  server: {
    handlers: {
      DELETE: deleteQueueItemHandler,
    },
  },
})

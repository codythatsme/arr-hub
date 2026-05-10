import { createFileRoute } from "@tanstack/react-router"

import { listQueueHandler } from "#/integrations/http/compatQueue"

export const Route = createFileRoute("/api/$version/queue")({
  server: {
    handlers: {
      GET: listQueueHandler,
    },
  },
})

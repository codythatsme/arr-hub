import { createFileRoute } from "@tanstack/react-router"

import { listQueueDetailsHandler } from "#/integrations/http/compatQueue"

export const Route = createFileRoute("/api/$version/queue/details")({
  server: {
    handlers: {
      GET: listQueueDetailsHandler,
    },
  },
})

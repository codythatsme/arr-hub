import { createFileRoute } from "@tanstack/react-router"

import { getQueueStatusHandler } from "#/integrations/http/compatQueue"

export const Route = createFileRoute("/api/$version/queue/status")({
  server: {
    handlers: {
      GET: getQueueStatusHandler,
    },
  },
})

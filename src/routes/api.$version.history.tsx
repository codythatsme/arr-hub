import { createFileRoute } from "@tanstack/react-router"

import { listHistoryHandler } from "#/integrations/http/compatHistory"

export const Route = createFileRoute("/api/$version/history")({
  server: {
    handlers: {
      GET: listHistoryHandler,
    },
  },
})

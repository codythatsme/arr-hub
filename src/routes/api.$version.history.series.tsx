import { createFileRoute } from "@tanstack/react-router"

import { seriesHistoryHandler } from "#/integrations/http/compatHistory"

export const Route = createFileRoute("/api/$version/history/series")({
  server: {
    handlers: {
      GET: seriesHistoryHandler,
    },
  },
})

import { createFileRoute } from "@tanstack/react-router"

import { createSeriesHandler, listSeriesHandler } from "#/integrations/http/compatSeries"

export const Route = createFileRoute("/api/$version/series")({
  server: {
    handlers: {
      GET: listSeriesHandler,
      POST: createSeriesHandler,
    },
  },
})

import { createFileRoute } from "@tanstack/react-router"

import {
  deleteSeriesHandler,
  getSeriesHandler,
  updateSeriesHandler,
} from "#/integrations/http/compatSeries"

export const Route = createFileRoute("/api/$version/series/$id")({
  server: {
    handlers: {
      DELETE: deleteSeriesHandler,
      GET: getSeriesHandler,
      PUT: updateSeriesHandler,
    },
  },
})

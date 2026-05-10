import { createFileRoute } from "@tanstack/react-router"

import { movieHistoryHandler } from "#/integrations/http/compatHistory"

export const Route = createFileRoute("/api/$version/history/movie")({
  server: {
    handlers: {
      GET: movieHistoryHandler,
    },
  },
})

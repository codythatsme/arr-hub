import { createFileRoute } from "@tanstack/react-router"

import { createIndexerHandler, listIndexersHandler } from "#/integrations/http/compatIndexers"

export const Route = createFileRoute("/api/$version/indexer")({
  server: {
    handlers: {
      GET: listIndexersHandler,
      POST: createIndexerHandler,
    },
  },
})

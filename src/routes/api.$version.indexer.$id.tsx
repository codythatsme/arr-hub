import { createFileRoute } from "@tanstack/react-router"

import {
  deleteIndexerHandler,
  getIndexerHandler,
  updateIndexerHandler,
} from "#/integrations/http/compatIndexers"

export const Route = createFileRoute("/api/$version/indexer/$id")({
  server: {
    handlers: {
      DELETE: deleteIndexerHandler,
      GET: getIndexerHandler,
      PUT: updateIndexerHandler,
    },
  },
})

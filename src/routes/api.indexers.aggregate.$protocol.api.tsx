import { createFileRoute } from "@tanstack/react-router"

import { aggregateIndexerHandler } from "./api.indexers.aggregate.$protocol"

export const Route = createFileRoute("/api/indexers/aggregate/$protocol/api")({
  server: { handlers: { GET: aggregateIndexerHandler } },
})

import { createFileRoute } from "@tanstack/react-router"

import { wantedMissingHandler } from "#/integrations/http/compatWanted"

export const Route = createFileRoute("/api/$version/wanted/missing")({
  server: {
    handlers: {
      GET: wantedMissingHandler,
    },
  },
})

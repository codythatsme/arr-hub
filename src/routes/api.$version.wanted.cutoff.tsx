import { createFileRoute } from "@tanstack/react-router"

import { wantedCutoffHandler } from "#/integrations/http/compatWanted"

export const Route = createFileRoute("/api/$version/wanted/cutoff")({
  server: {
    handlers: {
      GET: wantedCutoffHandler,
    },
  },
})

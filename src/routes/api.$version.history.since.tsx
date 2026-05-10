import { createFileRoute } from "@tanstack/react-router"

import { historySinceHandler } from "#/integrations/http/compatHistory"

export const Route = createFileRoute("/api/$version/history/since")({
  server: {
    handlers: {
      GET: historySinceHandler,
    },
  },
})

import { createFileRoute } from "@tanstack/react-router"

import { compatibleHealthHandler } from "#/integrations/http/compatSystem"

export const Route = createFileRoute("/api/$version/health")({
  server: { handlers: { GET: compatibleHealthHandler } },
})

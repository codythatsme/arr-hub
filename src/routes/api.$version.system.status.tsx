import { createFileRoute } from "@tanstack/react-router"

import { compatibleSystemStatusHandler } from "#/integrations/http/compatSystem"

export const Route = createFileRoute("/api/$version/system/status")({
  server: { handlers: { GET: compatibleSystemStatusHandler } },
})

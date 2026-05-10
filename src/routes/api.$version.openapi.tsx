import { createFileRoute } from "@tanstack/react-router"

import { compatibleOpenApiHandler } from "#/integrations/http/openapi"

export const Route = createFileRoute("/api/$version/openapi")({
  server: { handlers: { GET: compatibleOpenApiHandler } },
})

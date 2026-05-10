import { createFileRoute } from "@tanstack/react-router"

import { openApiHandler } from "#/integrations/http/openapi"

export const Route = createFileRoute("/api/openapi")({
  server: { handlers: { GET: openApiHandler } },
})

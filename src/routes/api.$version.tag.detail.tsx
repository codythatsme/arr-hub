import { createFileRoute } from "@tanstack/react-router"

import { listTagDetailsHandler } from "#/integrations/http/compatTags"

export const Route = createFileRoute("/api/$version/tag/detail")({
  server: { handlers: { GET: listTagDetailsHandler } },
})

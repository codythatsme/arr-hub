import { createFileRoute } from "@tanstack/react-router"

import { getTagDetailsHandler } from "#/integrations/http/compatTags"

export const Route = createFileRoute("/api/$version/tag/detail/$id")({
  server: { handlers: { GET: getTagDetailsHandler } },
})

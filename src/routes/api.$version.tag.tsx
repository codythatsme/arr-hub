import { createFileRoute } from "@tanstack/react-router"

import { createTagHandler, listTagsHandler } from "#/integrations/http/compatTags"

export const Route = createFileRoute("/api/$version/tag")({
  server: { handlers: { GET: listTagsHandler, POST: createTagHandler } },
})

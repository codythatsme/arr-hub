import { createFileRoute } from "@tanstack/react-router"

import { deleteTagHandler, getTagHandler, updateTagHandler } from "#/integrations/http/compatTags"

export const Route = createFileRoute("/api/$version/tag/$id")({
  server: { handlers: { DELETE: deleteTagHandler, GET: getTagHandler, PUT: updateTagHandler } },
})

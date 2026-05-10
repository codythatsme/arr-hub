import { createFileRoute } from "@tanstack/react-router"

import {
  createCustomFormatHandler,
  listCustomFormatsHandler,
} from "#/integrations/http/compatCustomFormats"

export const Route = createFileRoute("/api/$version/customformat")({
  server: {
    handlers: {
      GET: listCustomFormatsHandler,
      POST: createCustomFormatHandler,
    },
  },
})

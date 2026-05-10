import { createFileRoute } from "@tanstack/react-router"

import {
  deleteCustomFormatHandler,
  getCustomFormatHandler,
  updateCustomFormatHandler,
} from "#/integrations/http/compatCustomFormats"

export const Route = createFileRoute("/api/$version/customformat/$id")({
  server: {
    handlers: {
      DELETE: deleteCustomFormatHandler,
      GET: getCustomFormatHandler,
      PUT: updateCustomFormatHandler,
    },
  },
})

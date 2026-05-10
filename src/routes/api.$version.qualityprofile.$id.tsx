import { createFileRoute } from "@tanstack/react-router"

import {
  deleteQualityProfileHandler,
  getQualityProfileHandler,
  updateQualityProfileHandler,
} from "#/integrations/http/compatQualityProfiles"

export const Route = createFileRoute("/api/$version/qualityprofile/$id")({
  server: {
    handlers: {
      DELETE: deleteQualityProfileHandler,
      GET: getQualityProfileHandler,
      PUT: updateQualityProfileHandler,
    },
  },
})

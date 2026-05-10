import { createFileRoute } from "@tanstack/react-router"

import {
  createQualityProfileHandler,
  listQualityProfilesHandler,
} from "#/integrations/http/compatQualityProfiles"

export const Route = createFileRoute("/api/$version/qualityprofile")({
  server: {
    handlers: {
      GET: listQualityProfilesHandler,
      POST: createQualityProfileHandler,
    },
  },
})

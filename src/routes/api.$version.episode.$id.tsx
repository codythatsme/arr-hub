import { createFileRoute } from "@tanstack/react-router"

import { getEpisodeHandler, updateEpisodeHandler } from "#/integrations/http/compatEpisodes"

export const Route = createFileRoute("/api/$version/episode/$id")({
  server: {
    handlers: {
      GET: getEpisodeHandler,
      PUT: updateEpisodeHandler,
    },
  },
})

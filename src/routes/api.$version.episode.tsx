import { createFileRoute } from "@tanstack/react-router"

import { listEpisodesHandler } from "#/integrations/http/compatEpisodes"

export const Route = createFileRoute("/api/$version/episode")({
  server: {
    handlers: {
      GET: listEpisodesHandler,
    },
  },
})

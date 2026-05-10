import { createFileRoute } from "@tanstack/react-router"

import { getCalendarEpisodeHandler } from "#/integrations/http/compatCalendar"

export const Route = createFileRoute("/api/$version/calendar/$id")({
  server: {
    handlers: {
      GET: getCalendarEpisodeHandler,
    },
  },
})

import { createFileRoute } from "@tanstack/react-router"

import { listCalendarHandler } from "#/integrations/http/compatCalendar"

export const Route = createFileRoute("/api/$version/calendar")({
  server: {
    handlers: {
      GET: listCalendarHandler,
    },
  },
})

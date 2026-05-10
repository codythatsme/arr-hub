import { createFileRoute } from "@tanstack/react-router"

import { deleteCommandHandler, getCommandHandler } from "#/integrations/http/compatCommands"

export const Route = createFileRoute("/api/$version/command/$id")({
  server: {
    handlers: {
      GET: getCommandHandler,
      DELETE: deleteCommandHandler,
    },
  },
})

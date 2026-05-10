import { createFileRoute } from "@tanstack/react-router"

import { createCommandHandler, listCommandsHandler } from "#/integrations/http/compatCommands"

export const Route = createFileRoute("/api/$version/command")({
  server: {
    handlers: {
      GET: listCommandsHandler,
      POST: createCommandHandler,
    },
  },
})

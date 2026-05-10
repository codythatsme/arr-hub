import { createFileRoute } from "@tanstack/react-router"

import {
  createDownloadClientHandler,
  listDownloadClientsHandler,
} from "#/integrations/http/compatDownloadClients"

export const Route = createFileRoute("/api/$version/downloadclient")({
  server: {
    handlers: {
      GET: listDownloadClientsHandler,
      POST: createDownloadClientHandler,
    },
  },
})

import { createFileRoute } from "@tanstack/react-router"

import {
  deleteDownloadClientHandler,
  getDownloadClientHandler,
  updateDownloadClientHandler,
} from "#/integrations/http/compatDownloadClients"

export const Route = createFileRoute("/api/$version/downloadclient/$id")({
  server: {
    handlers: {
      DELETE: deleteDownloadClientHandler,
      GET: getDownloadClientHandler,
      PUT: updateDownloadClientHandler,
    },
  },
})

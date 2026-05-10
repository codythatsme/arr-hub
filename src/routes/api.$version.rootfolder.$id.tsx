import { createFileRoute } from "@tanstack/react-router"

import {
  deleteRootFolderHandler,
  getRootFolderHandler,
} from "#/integrations/http/compatRootFolders"

export const Route = createFileRoute("/api/$version/rootfolder/$id")({
  server: {
    handlers: {
      DELETE: deleteRootFolderHandler,
      GET: getRootFolderHandler,
    },
  },
})

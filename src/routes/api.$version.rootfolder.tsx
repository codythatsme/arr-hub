import { createFileRoute } from "@tanstack/react-router"

import {
  createRootFolderHandler,
  listRootFoldersHandler,
} from "#/integrations/http/compatRootFolders"

export const Route = createFileRoute("/api/$version/rootfolder")({
  server: {
    handlers: {
      GET: listRootFoldersHandler,
      POST: createRootFolderHandler,
    },
  },
})

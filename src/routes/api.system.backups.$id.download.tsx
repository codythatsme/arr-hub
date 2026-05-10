import { createReadStream } from "node:fs"
import { Readable } from "node:stream"

import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"

import { BackupService } from "#/effect/services/BackupService"
import { runAuthedResponse } from "#/integrations/http/effect"

function handler({ request }: { request: Request }) {
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").at(-2) ?? "")

  return runAuthedResponse(
    request,
    Effect.gen(function* () {
      const backups = yield* BackupService
      const file = yield* backups.getDatabaseBackupFile(id)
      const stream = Readable.toWeb(
        createReadStream(file.path),
      ) as unknown as ReadableStream<Uint8Array>

      return new Response(stream, {
        headers: {
          "content-disposition": `attachment; filename="${safeHeaderFilename(file.filename)}"`,
          "content-length": String(file.sizeBytes),
          "content-type": "application/vnd.sqlite3",
        },
      })
    }),
  )
}

function safeHeaderFilename(filename: string) {
  return filename.replace(/["\\\r\n]/g, "_")
}

export const Route = createFileRoute("/api/system/backups/$id/download")({
  server: { handlers: { GET: handler } },
})

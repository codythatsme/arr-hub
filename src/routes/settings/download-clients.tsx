import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/settings/download-clients")({
  component: DownloadClients,
})

function DownloadClients() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Download Clients</h1>
      <p className="text-muted-foreground mt-1">Configure download client connections</p>
    </div>
  )
}

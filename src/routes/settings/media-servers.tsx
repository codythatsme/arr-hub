import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/settings/media-servers")({
  component: MediaServers,
})

function MediaServers() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Media Servers</h1>
      <p className="text-muted-foreground mt-1">Configure media server connections</p>
    </div>
  )
}

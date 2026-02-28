import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/settings/media-management")({
  component: MediaManagement,
})

function MediaManagement() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Media Management</h1>
      <p className="text-muted-foreground mt-1">File naming, paths, and organization</p>
    </div>
  )
}

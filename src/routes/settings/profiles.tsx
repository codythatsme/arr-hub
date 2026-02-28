import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/settings/profiles")({ component: Profiles })

function Profiles() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Profiles</h1>
      <p className="text-muted-foreground mt-1">Quality and metadata profiles</p>
    </div>
  )
}

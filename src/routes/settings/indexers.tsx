import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/settings/indexers")({ component: Indexers })

function Indexers() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Indexers</h1>
      <p className="text-muted-foreground mt-1">Configure indexer connections</p>
    </div>
  )
}

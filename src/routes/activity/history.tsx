import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/activity/history")({ component: History })

function History() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">History</h1>
      <p className="text-muted-foreground mt-1">Download and import history</p>
    </div>
  )
}

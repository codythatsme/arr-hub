import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/settings/")({ component: Settings })

function Settings() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-muted-foreground mt-1">Application configuration overview</p>
    </div>
  )
}

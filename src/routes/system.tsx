import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/system')({ component: System })

function System() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">System</h1>
      <p className="text-muted-foreground mt-1">System status, logs, and diagnostics</p>
    </div>
  )
}

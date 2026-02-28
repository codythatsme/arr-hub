import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/general')({ component: General })

function General() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">General</h1>
      <p className="text-muted-foreground mt-1">General application settings</p>
    </div>
  )
}

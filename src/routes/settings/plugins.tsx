import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/plugins')({ component: Plugins })

function Plugins() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Plugins</h1>
      <p className="text-muted-foreground mt-1">Manage installed plugins</p>
    </div>
  )
}

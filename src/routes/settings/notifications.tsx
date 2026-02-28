import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/notifications')({
  component: Notifications,
})

function Notifications() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Notifications</h1>
      <p className="text-muted-foreground mt-1">Configure notification channels</p>
    </div>
  )
}

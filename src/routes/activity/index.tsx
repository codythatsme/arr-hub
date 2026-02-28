import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/activity/')({ component: Activity })

function Activity() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Activity</h1>
      <p className="text-muted-foreground mt-1">Recent activity summary</p>
    </div>
  )
}

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/activity/queue')({ component: Queue })

function Queue() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Queue</h1>
      <p className="text-muted-foreground mt-1">Current download queue</p>
    </div>
  )
}

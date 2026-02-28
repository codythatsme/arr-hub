import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/security')({ component: Security })

function Security() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Security</h1>
      <p className="text-muted-foreground mt-1">Authentication and access control</p>
    </div>
  )
}

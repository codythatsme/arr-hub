import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/movies/')({ component: Movies })

function Movies() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Movies</h1>
      <p className="text-muted-foreground mt-1">Browse and manage your movie collection</p>
    </div>
  )
}

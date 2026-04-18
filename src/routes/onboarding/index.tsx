import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

import { Button } from "#/components/ui/button"
import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/onboarding/")({ component: OnboardingLanding })

function OnboardingLanding() {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const status = useQuery(trpc.onboarding.status.queryOptions())

  useEffect(() => {
    if (status.data?.completed) {
      void navigate({ to: "/" })
    }
  }, [status.data?.completed, navigate])

  // If a wizard is already in progress, resume it.
  useEffect(() => {
    if (status.data?.started && status.data.path === "wizard" && !status.data.completed) {
      void navigate({ to: "/onboarding/wizard" })
    }
  }, [status.data, navigate])

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">Welcome to arr-hub</h1>
          <p className="text-muted-foreground">
            One cohesive app for movies, TV, indexers, download clients, and Plex.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <Card
            title="Quickstart"
            description="Create your admin account and get productive in under a minute. Integrations can be added afterward."
            action={
              <Button asChild>
                <Link to="/onboarding/quickstart">Start</Link>
              </Button>
            }
          />
          <Card
            title="Advanced wizard"
            description="Step through each decision: capabilities, profiles, indexers, download client, media server, and root folders."
            action={
              <Button asChild variant="outline">
                <Link to="/onboarding/wizard">Configure</Link>
              </Button>
            }
          />
        </div>
      </div>
    </div>
  )
}

function Card({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div className="mt-auto">{action}</div>
    </div>
  )
}

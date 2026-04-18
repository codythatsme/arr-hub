import { useQuery } from "@tanstack/react-query"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { useEffect } from "react"

import { useTRPC } from "#/integrations/trpc/react"
import { hasAuthToken } from "#/lib/auth-token"

const UNAUTHED_PATH_PREFIXES = ["/onboarding", "/login"]

/**
 * Redirects on first launch (no onboarding) or missing auth token.
 * Also passes through for allow-listed unauthed paths.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const isUnauthedPath = UNAUTHED_PATH_PREFIXES.some((p) => pathname.startsWith(p))

  const status = useQuery({
    ...trpc.onboarding.status.queryOptions(),
    staleTime: 5_000,
  })

  useEffect(() => {
    if (!status.data) return

    // First launch: no onboarding complete → go to /onboarding
    if (!status.data.completed) {
      if (!pathname.startsWith("/onboarding")) {
        void navigate({ to: "/onboarding" })
      }
      return
    }

    // Onboarded but on onboarding page — bounce to dashboard
    if (status.data.completed && pathname.startsWith("/onboarding")) {
      void navigate({ to: "/" })
      return
    }

    // Onboarded but no auth token — go to /login
    if (status.data.completed && !hasAuthToken() && !isUnauthedPath) {
      void navigate({ to: "/login" })
    }
  }, [status.data, pathname, navigate, isUnauthedPath])

  return <>{children}</>
}

export function useHideShell(): boolean {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return UNAUTHED_PATH_PREFIXES.some((p) => pathname.startsWith(p))
}

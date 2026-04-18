import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { useTRPC } from "#/integrations/trpc/react"
import { setAuthToken } from "#/lib/auth-token"

export const Route = createFileRoute("/login")({ component: Login })

function Login() {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation(
    trpc.auth.login.mutationOptions({
      onSuccess: async (data) => {
        setAuthToken(data.token)
        await queryClient.invalidateQueries()
        void navigate({ to: "/" })
      },
      onError: (e) => setError(e.message),
    }),
  )

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <form
        className="w-full max-w-sm space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          mutation.mutate({ username, password })
        }}
      >
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="text-muted-foreground text-sm">arr-hub admin login</p>
        </header>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Username</span>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Password</span>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <Button type="submit" disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  )
}

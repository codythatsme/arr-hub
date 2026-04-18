import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { useTRPC } from "#/integrations/trpc/react"
import { setAuthToken } from "#/lib/auth-token"

export const Route = createFileRoute("/onboarding/quickstart")({ component: Quickstart })

function Quickstart() {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState("admin")
  const [password, setPassword] = useState("")
  const [moviesRootFolder, setMoviesRootFolder] = useState("")
  const [tvRootFolder, setTvRootFolder] = useState("")
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation(
    trpc.onboarding.quickstart.mutationOptions({
      onSuccess: async (data) => {
        setAuthToken(data.session.token)
        await queryClient.invalidateQueries()
        void navigate({ to: "/" })
      },
      onError: (e) => setError(e.message),
    }),
  )

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    mutation.mutate({
      username,
      password,
      moviesRootFolder: moviesRootFolder.trim() || undefined,
      tvRootFolder: tvRootFolder.trim() || undefined,
    })
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <form className="w-full max-w-md space-y-6" onSubmit={onSubmit}>
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">Quickstart</h1>
          <p className="text-muted-foreground text-sm">
            Create your admin account. We&apos;ll apply recommended quality profiles automatically.
            You can add indexers, download clients, and Plex later from Settings.
          </p>
        </header>

        <Field label="Username">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </Field>

        <Field label="Password" hint="At least 8 characters">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>

        <Field label="Movies root folder" hint="Optional — can be added later">
          <Input
            value={moviesRootFolder}
            onChange={(e) => setMoviesRootFolder(e.target.value)}
            placeholder="/media/movies"
          />
        </Field>

        <Field label="TV root folder" hint="Optional — can be added later">
          <Input
            value={tvRootFolder}
            onChange={(e) => setTvRootFolder(e.target.value)}
            placeholder="/media/tv"
          />
        </Field>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" type="button">
            <Link to="/onboarding">← Back</Link>
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create account"}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-muted-foreground block text-xs">{hint}</span>}
    </label>
  )
}

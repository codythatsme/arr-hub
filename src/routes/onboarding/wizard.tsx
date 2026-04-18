import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { useTRPC } from "#/integrations/trpc/react"
import { setAuthToken } from "#/lib/auth-token"

export const Route = createFileRoute("/onboarding/wizard")({ component: Wizard })

const STEPS = [
  { key: "admin", label: "Admin account" },
  { key: "capabilities", label: "Capabilities" },
  { key: "profiles", label: "Quality profiles" },
  { key: "root_folders", label: "Root folders" },
  { key: "indexers", label: "Indexers" },
  { key: "download_client", label: "Download client" },
  { key: "media_server", label: "Media server" },
  { key: "import", label: "Import" },
  { key: "review", label: "Review" },
] as const

type StepKey = (typeof STEPS)[number]["key"]

function Wizard() {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const status = useQuery(trpc.onboarding.status.queryOptions())

  const startWizard = useMutation(
    trpc.onboarding.startWizard.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() }),
    }),
  )

  useEffect(() => {
    if (status.data?.completed) {
      void navigate({ to: "/" })
    }
  }, [status.data?.completed, navigate])

  useEffect(() => {
    // Initialize wizard state on first visit (if not yet started as wizard)
    if (status.data && !status.data.started && !startWizard.isPending && !startWizard.isSuccess) {
      startWizard.mutate()
    }
  }, [status.data, startWizard])

  if (status.isLoading || !status.data) {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center">
        Loading…
      </div>
    )
  }

  const currentStep = (status.data.currentStep ?? "admin") as StepKey
  const stepIndex = STEPS.findIndex((s) => s.key === currentStep)

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="border-b p-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Advanced setup</h1>
            <p className="text-muted-foreground text-sm">
              Step {stepIndex + 1} of {STEPS.length}: {STEPS[stepIndex]?.label ?? "—"}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/onboarding">Cancel</Link>
          </Button>
        </div>
        <div className="mx-auto mt-4 max-w-3xl">
          <div className="flex gap-1">
            {STEPS.map((s, i) => (
              <div
                key={s.key}
                className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <StepPanel step={currentStep} capabilities={status.data.capabilities} />
      </main>
    </div>
  )
}

function StepPanel({
  step,
  capabilities,
}: {
  step: StepKey
  capabilities: { readonly movies: boolean; readonly tv: boolean }
}) {
  switch (step) {
    case "admin":
      return <AdminStep />
    case "capabilities":
      return <CapabilitiesStep initial={capabilities} />
    case "profiles":
      return <ProfilesStep />
    case "root_folders":
      return <RootFoldersStep capabilities={capabilities} />
    case "indexers":
      return (
        <SkippableStep
          stepKey="indexers"
          title="Indexers"
          description="Indexer configuration is easier after setup — use Settings → Indexers once you're in."
        />
      )
    case "download_client":
      return (
        <SkippableStep
          stepKey="download_client"
          title="Download client"
          description="Add qBittorrent or SABnzbd from Settings → Download Clients after setup."
        />
      )
    case "media_server":
      return (
        <SkippableStep
          stepKey="media_server"
          title="Media server"
          description="Connect Plex from Settings → Media Servers after setup."
        />
      )
    case "import":
      return (
        <SkippableStep
          stepKey="import"
          title="Library import"
          description="Radarr/Sonarr import is not yet available. Skip for now — tracked as a separate feature."
        />
      )
    case "review":
      return <ReviewStep />
  }
}

// ─ Step navigation controls ─

function StepControls({
  onNext,
  nextLabel,
  nextDisabled,
  pending,
  error,
}: {
  onNext: () => void
  nextLabel: string
  nextDisabled?: boolean
  pending?: boolean
  error?: string | null
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const back = useMutation(
    trpc.onboarding.back.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() }),
    }),
  )

  return (
    <div className="mt-8 space-y-3">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => back.mutate()}
          disabled={back.isPending}
        >
          ← Back
        </Button>
        <Button type="button" onClick={onNext} disabled={nextDisabled || pending}>
          {pending ? "Saving…" : nextLabel}
        </Button>
      </div>
    </div>
  )
}

// ─ Individual steps ─

function AdminStep() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState("admin")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation(
    trpc.onboarding.submitAdmin.mutationOptions({
      onSuccess: async (data) => {
        setAuthToken(data.session.token)
        await queryClient.invalidateQueries()
      },
      onError: (e) => setError(e.message),
    }),
  )

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Create admin account</h2>
        <p className="text-muted-foreground text-sm">
          The single local admin with full access. Used by automation API keys too.
        </p>
      </div>

      <div className="space-y-4">
        <Field label="Username">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
      </div>

      <StepControls
        onNext={() => {
          setError(null)
          mutation.mutate({ username, password })
        }}
        nextLabel="Continue"
        nextDisabled={username.trim().length === 0 || password.length < 8}
        pending={mutation.isPending}
        error={error}
      />
    </section>
  )
}

function CapabilitiesStep({
  initial,
}: {
  initial: { readonly movies: boolean; readonly tv: boolean }
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [movies, setMovies] = useState(initial.movies)
  const [tv, setTv] = useState(initial.tv)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation(
    trpc.onboarding.submitCapabilities.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() }),
      onError: (e) => setError(e.message),
    }),
  )

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Choose capabilities</h2>
        <p className="text-muted-foreground text-sm">
          Pick what arr-hub should manage. You can toggle these later in Settings.
        </p>
      </div>

      <div className="space-y-3">
        <Toggle label="Movies" checked={movies} onChange={setMovies} />
        <Toggle label="TV series" checked={tv} onChange={setTv} />
      </div>

      <StepControls
        onNext={() => {
          setError(null)
          mutation.mutate({ movies, tv })
        }}
        nextLabel="Continue"
        nextDisabled={!movies && !tv}
        pending={mutation.isPending}
        error={error}
      />
    </section>
  )
}

function ProfilesStep() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation(
    trpc.onboarding.submitProfiles.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() }),
      onError: (e) => setError(e.message),
    }),
  )

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Quality profiles</h2>
        <p className="text-muted-foreground text-sm">
          We&apos;ll seed TRaSH-inspired defaults. You can customize each profile from Settings →
          Profiles after setup.
        </p>
      </div>

      <div className="rounded-lg border p-4 text-sm">
        <strong>Default bundle:</strong> TRaSH HD (1080p/2160p tiers with curated custom format
        scoring).
      </div>

      <StepControls
        onNext={() => {
          setError(null)
          mutation.mutate({ bundleId: "trash-hd" })
        }}
        nextLabel="Apply defaults"
        pending={mutation.isPending}
        error={error}
      />
    </section>
  )
}

function RootFoldersStep({
  capabilities,
}: {
  capabilities: { readonly movies: boolean; readonly tv: boolean }
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [moviesPath, setMoviesPath] = useState("")
  const [tvPath, setTvPath] = useState("")
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation(
    trpc.onboarding.submitRootFolders.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() }),
      onError: (e) => setError(e.message),
    }),
  )

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Root folders</h2>
        <p className="text-muted-foreground text-sm">
          Where media lives on disk. Optional — skip and add them later from Settings.
        </p>
      </div>

      <div className="space-y-4">
        {capabilities.movies && (
          <Field label="Movies folder">
            <Input
              value={moviesPath}
              onChange={(e) => setMoviesPath(e.target.value)}
              placeholder="/media/movies"
            />
          </Field>
        )}
        {capabilities.tv && (
          <Field label="TV folder">
            <Input
              value={tvPath}
              onChange={(e) => setTvPath(e.target.value)}
              placeholder="/media/tv"
            />
          </Field>
        )}
      </div>

      <StepControls
        onNext={() => {
          setError(null)
          mutation.mutate({
            movies: moviesPath.trim() || undefined,
            tv: tvPath.trim() || undefined,
          })
        }}
        nextLabel="Continue"
        pending={mutation.isPending}
        error={error}
      />
    </section>
  )
}

function SkippableStep({
  stepKey,
  title,
  description,
}: {
  stepKey: StepKey
  title: string
  description: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const skip = useMutation(
    trpc.onboarding.skip.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() }),
      onError: (e) => setError(e.message),
    }),
  )

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

      <StepControls
        onNext={() => {
          setError(null)
          skip.mutate({ step: stepKey })
        }}
        nextLabel="Skip for now"
        pending={skip.isPending}
        error={error}
      />
    </section>
  )
}

function ReviewStep() {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const status = useQuery(trpc.onboarding.status.queryOptions())
  const [error, setError] = useState<string | null>(null)

  const complete = useMutation(
    trpc.onboarding.complete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries()
        void navigate({ to: "/" })
      },
      onError: (e) => setError(e.message),
    }),
  )

  const completed = status.data?.completedSteps ?? []
  const caps = status.data?.capabilities ?? { movies: true, tv: true }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Review</h2>
        <p className="text-muted-foreground text-sm">
          Confirm your setup. Click Finish to activate arr-hub.
        </p>
      </div>

      <dl className="space-y-3 rounded-lg border p-4 text-sm">
        <Row label="Admin" value={status.data?.hasAdmin ? "Created" : "Missing"} />
        <Row
          label="Capabilities"
          value={[caps.movies && "Movies", caps.tv && "TV"].filter(Boolean).join(", ") || "None"}
        />
        <Row label="Completed steps" value={completed.length ? completed.join(", ") : "—"} />
      </dl>

      <StepControls
        onNext={() => {
          setError(null)
          complete.mutate()
        }}
        nextLabel="Finish"
        nextDisabled={!status.data?.hasAdmin}
        pending={complete.isPending}
        error={error}
      />
    </section>
  )
}

// ─ Tiny UI helpers ─

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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-3 rounded-md border p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4"
      />
      <span className="text-sm font-medium">{label}</span>
    </label>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

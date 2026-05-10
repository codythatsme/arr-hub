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
  const status = useQuery(trpc.onboarding.status.queryOptions())

  useEffect(() => {
    if (status.data?.completed) {
      void navigate({ to: "/" })
    }
  }, [status.data?.completed, navigate])

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
      return <IndexerStep />
    case "download_client":
      return <DownloadClientStep />
    case "media_server":
      return <MediaServerStep />
    case "import":
      return <ImportStep capabilities={capabilities} />

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

function IndexerStep() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const types = useQuery(trpc.indexers.listTypes.queryOptions())
  const [name, setName] = useState("Primary indexer")
  const [type, setType] = useState("torznab")
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [categories, setCategories] = useState("2000,5000")
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation(
    trpc.onboarding.submitIndexer.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() }),
      onError: (e) => setError(e.message),
    }),
  )

  const parsedCategories = categories
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item))

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Indexers</h2>
        <p className="text-muted-foreground text-sm">
          Add and test a Torznab or Newznab indexer before activation.
        </p>
      </div>

      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Type</span>
          <select
            className="bg-background w-full rounded-md border px-3 py-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {(types.data ?? []).map((entry) => (
              <option key={entry.type} value={entry.type}>
                {entry.metadata.displayName}
              </option>
            ))}
          </select>
        </label>
        <Field label="Base URL">
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://indexer.example"
          />
        </Field>
        <Field label="API key">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Categories" hint="Comma-separated Torznab/Newznab category IDs">
          <Input value={categories} onChange={(e) => setCategories(e.target.value)} />
        </Field>
      </div>

      <IntegrationSkipButton stepKey="indexers" disabled={mutation.isPending} />
      <StepControls
        onNext={() => {
          setError(null)
          mutation.mutate({
            name,
            type,
            baseUrl,
            apiKey,
            categories: parsedCategories,
          })
        }}
        nextLabel="Test and continue"
        nextDisabled={
          name.trim().length === 0 || baseUrl.trim().length === 0 || apiKey.length === 0
        }
        pending={mutation.isPending}
        error={error}
      />
    </section>
  )
}

function DownloadClientStep() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const types = useQuery(trpc.downloadClients.listTypes.queryOptions())
  const [name, setName] = useState("Download client")
  const [type, setType] = useState("qbittorrent")
  const [host, setHost] = useState("localhost")
  const [port, setPort] = useState(8080)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [useSsl, setUseSsl] = useState(false)
  const [category, setCategory] = useState("arr-hub")
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation(
    trpc.onboarding.submitDownloadClient.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() }),
      onError: (e) => setError(e.message),
    }),
  )

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Download client</h2>
        <p className="text-muted-foreground text-sm">
          Add a download client and verify ARR Hub can connect.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Type</span>
          <select
            className="bg-background w-full rounded-md border px-3 py-2 text-sm"
            value={type}
            onChange={(e) => {
              const nextType = e.target.value
              setType(nextType)
              const selected = types.data?.find((entry) => entry.type === nextType)
              if (selected) setPort(selected.metadata.defaultPort)
            }}
          >
            {(types.data ?? []).map((entry) => (
              <option key={entry.type} value={entry.type}>
                {entry.metadata.displayName}
              </option>
            ))}
          </select>
        </label>
        <Field label="Host">
          <Input value={host} onChange={(e) => setHost(e.target.value)} />
        </Field>
        <Field label="Port">
          <Input
            type="number"
            value={String(port)}
            onChange={(e) => setPort(Number(e.target.value))}
          />
        </Field>
        <Field label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Category">
          <Input value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <Toggle label="Use SSL" checked={useSsl} onChange={setUseSsl} />
      </div>

      <IntegrationSkipButton stepKey="download_client" disabled={mutation.isPending} />
      <StepControls
        onNext={() => {
          setError(null)
          mutation.mutate({
            name,
            type,
            host,
            port,
            username,
            password,
            useSsl,
            category: category.trim() || undefined,
          })
        }}
        nextLabel="Test and continue"
        nextDisabled={name.trim().length === 0 || host.trim().length === 0 || port < 1}
        pending={mutation.isPending}
        error={error}
      />
    </section>
  )
}

function MediaServerStep() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const types = useQuery(trpc.mediaServers.listTypes.queryOptions())
  const [name, setName] = useState("Plex")
  const [type, setType] = useState("plex")
  const [host, setHost] = useState("localhost")
  const [port, setPort] = useState(32400)
  const [token, setToken] = useState("")
  const [useSsl, setUseSsl] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation(
    trpc.onboarding.submitMediaServer.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() }),
      onError: (e) => setError(e.message),
    }),
  )

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Media server</h2>
        <p className="text-muted-foreground text-sm">
          Connect Plex and verify active stream monitoring can start after setup.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Type</span>
          <select
            className="bg-background w-full rounded-md border px-3 py-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {(types.data ?? []).map((entry) => (
              <option key={entry.type} value={entry.type}>
                {entry.metadata.displayName}
              </option>
            ))}
          </select>
        </label>
        <Field label="Host">
          <Input value={host} onChange={(e) => setHost(e.target.value)} />
        </Field>
        <Field label="Port">
          <Input
            type="number"
            value={String(port)}
            onChange={(e) => setPort(Number(e.target.value))}
          />
        </Field>
        <Field label="Token">
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Toggle label="Use SSL" checked={useSsl} onChange={setUseSsl} />
      </div>

      <IntegrationSkipButton stepKey="media_server" disabled={mutation.isPending} />
      <StepControls
        onNext={() => {
          setError(null)
          mutation.mutate({ name, type, host, port, token, useSsl })
        }}
        nextLabel="Test and continue"
        nextDisabled={
          name.trim().length === 0 || host.trim().length === 0 || port < 1 || token.length === 0
        }
        pending={mutation.isPending}
        error={error}
      />
    </section>
  )
}

function IntegrationSkipButton({ stepKey, disabled }: { stepKey: StepKey; disabled?: boolean }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const skip = useMutation(
    trpc.onboarding.skip.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() }),
    }),
  )

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => skip.mutate({ step: stepKey })}
      disabled={disabled || skip.isPending}
    >
      Skip for now
    </Button>
  )
}

function ImportStep({
  capabilities,
}: {
  capabilities: { readonly movies: boolean; readonly tv: boolean }
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

  const onContinue = () => {
    setError(null)
    skip.mutate({ step: "import" })
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Import from Radarr / Sonarr</h2>
        <p className="text-muted-foreground text-sm">
          Optional — pull your existing library. Credentials are only used for this import and never
          stored.
        </p>
      </div>

      {capabilities.movies && <ImportCard source="radarr" title="Radarr (Movies)" />}
      {capabilities.tv && <ImportCard source="sonarr" title="Sonarr (TV)" />}

      <StepControls
        onNext={onContinue}
        nextLabel="Continue"
        pending={skip.isPending}
        error={error}
      />
    </section>
  )
}

function ImportCard({ source, title }: { source: "radarr" | "sonarr"; title: string }) {
  const trpc = useTRPC()
  const [url, setUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [testResult, setTestResult] = useState<
    { ok: true; version: string } | { ok: false; message: string } | null
  >(null)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(
    null,
  )

  const testMutation = useMutation(
    source === "radarr"
      ? trpc.import.testRadarr.mutationOptions({
          onSuccess: (data) => setTestResult({ ok: true, version: data.version }),
          onError: (e) => setTestResult({ ok: false, message: e.message }),
        })
      : trpc.import.testSonarr.mutationOptions({
          onSuccess: (data) => setTestResult({ ok: true, version: data.version }),
          onError: (e) => setTestResult({ ok: false, message: e.message }),
        }),
  )

  const importMutation = useMutation(
    source === "radarr"
      ? trpc.import.executeRadarr.mutationOptions({
          onSuccess: (data) => setImportResult(data),
          onError: (e) => setTestResult({ ok: false, message: e.message }),
        })
      : trpc.import.executeSonarr.mutationOptions({
          onSuccess: (data) => setImportResult(data),
          onError: (e) => setTestResult({ ok: false, message: e.message }),
        }),
  )

  const canTest = url.trim().length > 0 && apiKey.trim().length > 0
  const canImport = testResult?.ok === true && !importMutation.isPending && importResult === null

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="font-medium">{title}</div>
      <Field label="URL">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:7878"
          autoComplete="off"
        />
      </Field>
      <Field label="API key">
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setTestResult(null)
            setImportResult(null)
            testMutation.mutate({ url: url.trim(), apiKey: apiKey.trim() })
          }}
          disabled={!canTest || testMutation.isPending}
        >
          {testMutation.isPending ? "Testing…" : "Test connection"}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setImportResult(null)
            importMutation.mutate({ url: url.trim(), apiKey: apiKey.trim() })
          }}
          disabled={!canImport}
        >
          {importMutation.isPending ? "Importing…" : "Import now"}
        </Button>
      </div>

      {testResult?.ok === true && importResult === null && (
        <p className="text-sm text-green-600">Connected — v{testResult.version}</p>
      )}
      {testResult?.ok === false && <p className="text-destructive text-sm">{testResult.message}</p>}
      {importResult && (
        <p className="text-sm text-green-600">
          Imported {importResult.imported} · Skipped {importResult.skipped}
        </p>
      )}
    </div>
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

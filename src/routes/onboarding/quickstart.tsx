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
  const [includeIndexer, setIncludeIndexer] = useState(false)
  const [indexerName, setIndexerName] = useState("Indexer")
  const [indexerType, setIndexerType] = useState("torznab")
  const [indexerBaseUrl, setIndexerBaseUrl] = useState("")
  const [indexerApiKey, setIndexerApiKey] = useState("")
  const [includeDownloadClient, setIncludeDownloadClient] = useState(false)
  const [downloadClientName, setDownloadClientName] = useState("qBittorrent")
  const [downloadClientType, setDownloadClientType] = useState("qbittorrent")
  const [downloadClientHost, setDownloadClientHost] = useState("localhost")
  const [downloadClientPort, setDownloadClientPort] = useState("8080")
  const [downloadClientUsername, setDownloadClientUsername] = useState("")
  const [downloadClientPassword, setDownloadClientPassword] = useState("")
  const [includeMediaServer, setIncludeMediaServer] = useState(false)
  const [mediaServerName, setMediaServerName] = useState("Plex")
  const [mediaServerHost, setMediaServerHost] = useState("localhost")
  const [mediaServerPort, setMediaServerPort] = useState("32400")
  const [mediaServerToken, setMediaServerToken] = useState("")
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
      indexer: includeIndexer
        ? {
            name: indexerName,
            type: indexerType,
            baseUrl: indexerBaseUrl,
            apiKey: indexerApiKey,
          }
        : undefined,
      downloadClient: includeDownloadClient
        ? {
            name: downloadClientName,
            type: downloadClientType,
            host: downloadClientHost,
            port: Number(downloadClientPort),
            username: downloadClientUsername,
            password: downloadClientPassword,
          }
        : undefined,
      mediaServer: includeMediaServer
        ? {
            name: mediaServerName,
            type: "plex",
            host: mediaServerHost,
            port: Number(mediaServerPort),
            token: mediaServerToken,
          }
        : undefined,
    })
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <form className="w-full max-w-md space-y-6" onSubmit={onSubmit}>
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">Quickstart</h1>
          <p className="text-muted-foreground text-sm">
            Create your admin account. We&apos;ll apply recommended quality profiles automatically.
            Add core integrations here to test them before setup is activated.
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

        <fieldset className="space-y-3 rounded-md border p-3">
          <Toggle
            checked={includeIndexer}
            onChange={setIncludeIndexer}
            label="Validate an indexer"
          />
          {includeIndexer && (
            <div className="grid gap-3">
              <Field label="Name">
                <Input value={indexerName} onChange={(e) => setIndexerName(e.target.value)} />
              </Field>
              <Field label="Type">
                <select
                  value={indexerType}
                  onChange={(e) => setIndexerType(e.target.value)}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="torznab">Torznab</option>
                  <option value="newznab">Newznab</option>
                </select>
              </Field>
              <Field label="Base URL">
                <Input
                  value={indexerBaseUrl}
                  onChange={(e) => setIndexerBaseUrl(e.target.value)}
                  placeholder="http://localhost:9696"
                />
              </Field>
              <Field label="API key">
                <Input
                  value={indexerApiKey}
                  onChange={(e) => setIndexerApiKey(e.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-3 rounded-md border p-3">
          <Toggle
            checked={includeDownloadClient}
            onChange={setIncludeDownloadClient}
            label="Validate a download client"
          />
          {includeDownloadClient && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input
                  value={downloadClientName}
                  onChange={(e) => setDownloadClientName(e.target.value)}
                />
              </Field>
              <Field label="Type">
                <select
                  value={downloadClientType}
                  onChange={(e) => {
                    const type = e.target.value
                    setDownloadClientType(type)
                    setDownloadClientPort(
                      type === "transmission"
                        ? "9091"
                        : type === "nzbget"
                          ? "6789"
                          : type === "deluge"
                            ? "8112"
                            : "8080",
                    )
                  }}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="qbittorrent">qBittorrent</option>
                  <option value="sabnzbd">SABnzbd</option>
                  <option value="nzbget">NZBGet</option>
                  <option value="transmission">Transmission</option>
                  <option value="deluge">Deluge</option>
                </select>
              </Field>
              <Field label="Host">
                <Input
                  value={downloadClientHost}
                  onChange={(e) => setDownloadClientHost(e.target.value)}
                />
              </Field>
              <Field label="Port">
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={downloadClientPort}
                  onChange={(e) => setDownloadClientPort(e.target.value)}
                />
              </Field>
              <Field label="Username">
                <Input
                  value={downloadClientUsername}
                  onChange={(e) => setDownloadClientUsername(e.target.value)}
                />
              </Field>
              <Field label="Password / API key">
                <Input
                  value={downloadClientPassword}
                  onChange={(e) => setDownloadClientPassword(e.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-3 rounded-md border p-3">
          <Toggle
            checked={includeMediaServer}
            onChange={setIncludeMediaServer}
            label="Validate Plex"
          />
          {includeMediaServer && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input
                  value={mediaServerName}
                  onChange={(e) => setMediaServerName(e.target.value)}
                />
              </Field>
              <Field label="Host">
                <Input
                  value={mediaServerHost}
                  onChange={(e) => setMediaServerHost(e.target.value)}
                />
              </Field>
              <Field label="Port">
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={mediaServerPort}
                  onChange={(e) => setMediaServerPort(e.target.value)}
                />
              </Field>
              <Field label="Token">
                <Input
                  value={mediaServerToken}
                  onChange={(e) => setMediaServerToken(e.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
          )}
        </fieldset>

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

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4"
      />
      {label}
    </label>
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

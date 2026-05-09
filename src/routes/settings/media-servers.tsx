import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { RefreshCw, Save, Server, Trash2 } from "lucide-react"
import { type FormEvent, type ReactNode, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/media-servers")({
  component: MediaServers,
})

interface MediaServerFormState {
  readonly id: number | null
  readonly name: string
  readonly type: string
  readonly host: string
  readonly port: string
  readonly token: string
  readonly useSsl: boolean
  readonly enabled: boolean
  readonly syncIntervalMinutes: string
  readonly monitoringEnabled: boolean
}

const emptyForm: MediaServerFormState = {
  id: null,
  name: "",
  type: "plex",
  host: "localhost",
  port: "32400",
  token: "",
  useSsl: false,
  enabled: true,
  syncIntervalMinutes: "60",
  monitoringEnabled: true,
}

function MediaServers() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<MediaServerFormState>(emptyForm)
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const listKey = trpc.mediaServers.list.queryKey()
  const servers = useQuery(trpc.mediaServers.list.queryOptions())
  const types = useQuery(trpc.mediaServers.listTypes.queryOptions())
  const libraries = useQuery(
    trpc.mediaServers.libraries.queryOptions(
      { id: selectedServerId ?? 0 },
      { enabled: selectedServerId !== null },
    ),
  )

  const invalidate = () => queryClient.invalidateQueries({ queryKey: listKey })
  const add = useMutation(
    trpc.mediaServers.add.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        setForm(emptyForm)
        setMessage("Media server added.")
      },
    }),
  )
  const update = useMutation(
    trpc.mediaServers.update.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        setForm(emptyForm)
        setMessage("Media server updated.")
      },
    }),
  )
  const remove = useMutation(
    trpc.mediaServers.remove.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        setSelectedServerId(null)
        setMessage("Media server removed.")
      },
    }),
  )
  const test = useMutation(
    trpc.mediaServers.test.mutationOptions({
      onSuccess: async (result) => {
        await invalidate()
        setMessage(`${result.name} connection is ${result.health?.status ?? "unknown"}.`)
      },
    }),
  )
  const sync = useMutation(
    trpc.mediaServers.sync.mutationOptions({
      onSuccess: (result) =>
        setMessage(
          `Library sync finished: ${result.matched} matched, ${result.unmatched} unmatched.`,
        ),
    }),
  )

  const typeOptions = types.data ?? []
  const selectedType = typeOptions.find((item) => item.type === form.type)
  const selectedServer = servers.data?.find((server) => server.id === selectedServerId) ?? null
  const pending =
    add.isPending || update.isPending || remove.isPending || test.isPending || sync.isPending
  const error =
    add.error?.message ??
    update.error?.message ??
    remove.error?.message ??
    test.error?.message ??
    sync.error?.message ??
    libraries.error?.message

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    const settings = {
      syncIntervalMs: Number(form.syncIntervalMinutes) * 60_000,
      monitoringEnabled: form.monitoringEnabled,
    }
    const payload = {
      name: form.name.trim(),
      type: form.type,
      host: form.host.trim(),
      port: Number(form.port),
      useSsl: form.useSsl,
      enabled: form.enabled,
      settings,
    }

    if (form.id === null) {
      add.mutate({ ...payload, token: form.token })
      return
    }

    update.mutate({
      id: form.id,
      data: {
        ...payload,
        ...(form.token.length > 0 ? { token: form.token } : {}),
      },
    })
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Media Servers</h1>
        <p className="text-muted-foreground mt-1">
          Configure Plex or Jellyfin connections for library sync, refresh, and stream monitoring.
        </p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Configured Servers</h2>
            {servers.isLoading && (
              <p className="text-muted-foreground text-sm">Loading media servers...</p>
            )}
            {servers.error && <p className="text-destructive text-sm">{servers.error.message}</p>}
            {servers.data?.length === 0 && (
              <p className="text-muted-foreground text-sm">No media servers configured.</p>
            )}
            {servers.data?.map((server) => (
              <article key={server.id} className="rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Server className="size-4" />
                      <h3 className="font-medium">{server.name}</h3>
                      <StatusBadge enabled={server.enabled} status={server.health?.status} />
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm break-all">
                      {server.useSsl ? "https" : "http"}://{server.host}:{server.port}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {server.type} · sync every{" "}
                      {Math.round(server.settings.syncIntervalMs / 60_000)}m · monitoring{" "}
                      {server.settings.monitoringEnabled ? "on" : "off"}
                    </p>
                    {server.health?.errorMessage && (
                      <p className="text-destructive mt-2 text-xs">{server.health.errorMessage}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                      disabled={pending}
                      onClick={() =>
                        setForm({
                          id: server.id,
                          name: server.name,
                          type: server.type,
                          host: server.host,
                          port: String(server.port),
                          token: "",
                          useSsl: server.useSsl,
                          enabled: server.enabled,
                          syncIntervalMinutes: String(
                            Math.round(server.settings.syncIntervalMs / 60_000),
                          ),
                          monitoringEnabled: server.settings.monitoringEnabled,
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                      disabled={pending}
                      onClick={() =>
                        update.mutate({
                          id: server.id,
                          data: { enabled: !server.enabled },
                        })
                      }
                    >
                      {server.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                      disabled={pending}
                      onClick={() => setSelectedServerId(server.id)}
                    >
                      Libraries
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
                      disabled={pending}
                      onClick={() => test.mutate({ id: server.id })}
                    >
                      <RefreshCw className="size-3" />
                      Test
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${server.name}`}
                      className="rounded border p-1.5 disabled:opacity-50"
                      disabled={pending}
                      onClick={() => remove.mutate({ id: server.id })}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {selectedServer && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">{selectedServer.name} Libraries</h2>
                <p className="text-muted-foreground text-sm">
                  Fetches server libraries and can sync matched movies or episodes into ARR Hub.
                </p>
              </div>
              {libraries.isLoading && (
                <p className="text-muted-foreground text-sm">Loading libraries...</p>
              )}
              {libraries.data?.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No libraries reported by the server.
                </p>
              )}
              {libraries.data && libraries.data.length > 0 && (
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Library</th>
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <th className="px-3 py-2 text-right font-medium">Last Synced</th>
                        <th className="px-3 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {libraries.data.map((library) => (
                        <tr key={library.id} className="border-t">
                          <td className="px-3 py-2">{library.name}</td>
                          <td className="px-3 py-2">{library.type}</td>
                          <td className="px-3 py-2 text-right">
                            {library.lastSynced
                              ? new Date(library.lastSynced).toLocaleString()
                              : "never"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                              disabled={pending}
                              onClick={() =>
                                sync.mutate({
                                  serverId: library.mediaServerId,
                                  libraryId: library.externalId,
                                })
                              }
                            >
                              Sync
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>

        <form className="h-fit rounded-md border p-4" onSubmit={onSubmit}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {form.id === null ? "Add Media Server" : "Edit Media Server"}
            </h2>
            {form.id !== null && (
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                onClick={() => setForm(emptyForm)}
              >
                Cancel
              </button>
            )}
          </div>

          <div className="mt-4 space-y-4">
            <Field label="Name">
              <input
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </Field>

            <Field
              label="Type"
              hint={
                selectedType
                  ? `${selectedType.metadata.displayName} · ${selectedType.metadata.authModel} · default ${selectedType.metadata.defaultPort}`
                  : undefined
              }
            >
              <select
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={form.type}
                onChange={(event) => {
                  const option = typeOptions.find((item) => item.type === event.target.value)
                  setForm({
                    ...form,
                    type: event.target.value,
                    port: option ? String(option.metadata.defaultPort) : form.port,
                  })
                }}
              >
                {typeOptions.length === 0 && <option value={form.type}>{form.type}</option>}
                {typeOptions.map((type) => (
                  <option key={type.type} value={type.type}>
                    {type.metadata.displayName}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
              <Field label="Host">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={form.host}
                  onChange={(event) => setForm({ ...form, host: event.target.value })}
                  required
                />
              </Field>
              <Field label="Port">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={form.port}
                  onChange={(event) => setForm({ ...form, port: event.target.value })}
                  type="number"
                  min={1}
                  max={65535}
                  required
                />
              </Field>
            </div>

            <Field
              label="Token"
              hint={form.id === null ? undefined : "Leave blank to keep the existing secret."}
            >
              <input
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={form.token}
                onChange={(event) => setForm({ ...form, token: event.target.value })}
                autoComplete="off"
                required={form.id === null}
                type="password"
              />
            </Field>

            <Field label="Library sync interval" hint="Minutes between scheduled sync checks.">
              <input
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={form.syncIntervalMinutes}
                onChange={(event) => setForm({ ...form, syncIntervalMinutes: event.target.value })}
                type="number"
                min={1}
                required
              />
            </Field>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.useSsl}
                  onChange={(event) => setForm({ ...form, useSsl: event.target.checked })}
                />
                Use SSL
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                />
                Enabled
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.monitoringEnabled}
                  onChange={(event) =>
                    setForm({ ...form, monitoringEnabled: event.target.checked })
                  }
                />
                Stream monitoring
              </label>
            </div>

            {message && <p className="text-sm text-emerald-600">{message}</p>}
            {error && <p className="text-destructive text-sm">{error}</p>}

            <button
              type="submit"
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
              disabled={pending}
            >
              <Save className="size-4" />
              {form.id === null ? "Add server" : "Save server"}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function Field(props: {
  readonly label: string
  readonly hint?: string
  readonly children: ReactNode
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{props.label}</span>
      {props.children}
      {props.hint && <span className="text-muted-foreground mt-1 block text-xs">{props.hint}</span>}
    </label>
  )
}

function StatusBadge(props: { readonly enabled: boolean; readonly status?: string }) {
  const status = props.enabled ? (props.status ?? "unknown") : "disabled"
  return <span className="bg-muted rounded px-2 py-1 text-xs">{status}</span>
}

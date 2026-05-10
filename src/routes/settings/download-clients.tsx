import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { DownloadCloud, RefreshCw, Save, Trash2 } from "lucide-react"
import { type FormEvent, type ReactNode, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/download-clients")({
  component: DownloadClients,
})

interface DownloadClientFormState {
  readonly id: number | null
  readonly name: string
  readonly type: string
  readonly host: string
  readonly port: string
  readonly username: string
  readonly password: string
  readonly useSsl: boolean
  readonly category: string
  readonly priority: string
  readonly pollIntervalMs: string
  readonly addPaused: boolean
  readonly removeCompletedDownloads: boolean
  readonly removeFailedDownloads: boolean
  readonly blackholeFolder: string
  readonly watchFolder: string
  readonly saveMagnetFiles: boolean
  readonly magnetFileExtension: string
  readonly watchGracePeriodSeconds: string
  readonly enabled: boolean
}

const emptyForm: DownloadClientFormState = {
  id: null,
  name: "",
  type: "qbittorrent",
  host: "localhost",
  port: "8080",
  username: "",
  password: "",
  useSsl: false,
  category: "",
  priority: "50",
  pollIntervalMs: "5000",
  addPaused: false,
  removeCompletedDownloads: false,
  removeFailedDownloads: false,
  blackholeFolder: "/downloads/blackhole",
  watchFolder: "/downloads",
  saveMagnetFiles: false,
  magnetFileExtension: ".magnet",
  watchGracePeriodSeconds: "30",
  enabled: true,
}

function isBlackholeType(type: string): boolean {
  return type === "torrent_blackhole" || type === "usenet_blackhole"
}

function blackholeDefaults(
  type: string,
): Pick<
  DownloadClientFormState,
  "blackholeFolder" | "watchFolder" | "saveMagnetFiles" | "magnetFileExtension"
> {
  return {
    blackholeFolder:
      type === "usenet_blackhole" ? "/downloads/blackhole/nzbs" : "/downloads/blackhole/torrents",
    watchFolder: "/downloads",
    saveMagnetFiles: false,
    magnetFileExtension: ".magnet",
  }
}

function DownloadClients() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<DownloadClientFormState>(emptyForm)
  const [message, setMessage] = useState<string | null>(null)

  const listKey = trpc.downloadClients.list.queryKey()
  const clients = useQuery(trpc.downloadClients.list.queryOptions())
  const types = useQuery(trpc.downloadClients.listTypes.queryOptions())

  const invalidate = () => queryClient.invalidateQueries({ queryKey: listKey })
  const add = useMutation(
    trpc.downloadClients.add.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        setForm(emptyForm)
        setMessage("Download client added.")
      },
    }),
  )
  const update = useMutation(
    trpc.downloadClients.update.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        setForm(emptyForm)
        setMessage("Download client updated.")
      },
    }),
  )
  const remove = useMutation(
    trpc.downloadClients.remove.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        setMessage("Download client removed.")
      },
    }),
  )
  const test = useMutation(
    trpc.downloadClients.test.mutationOptions({
      onSuccess: async (result) => {
        await invalidate()
        setMessage(`${result.name} connection is ${result.health?.status ?? "unknown"}.`)
      },
    }),
  )

  const typeOptions = types.data ?? []
  const selectedType = typeOptions.find((item) => item.type === form.type)
  const isBlackhole = isBlackholeType(form.type)
  const pending = add.isPending || update.isPending || remove.isPending || test.isPending
  const error =
    add.error?.message ?? update.error?.message ?? remove.error?.message ?? test.error?.message

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    const settings = {
      pollIntervalMs: Number(form.pollIntervalMs),
      addPaused: form.addPaused,
      removeCompletedDownloads: form.removeCompletedDownloads,
      removeFailedDownloads: form.removeFailedDownloads,
      ...(isBlackhole
        ? {
            blackholeFolder: form.blackholeFolder.trim(),
            watchFolder: form.watchFolder.trim(),
            saveMagnetFiles: form.saveMagnetFiles,
            magnetFileExtension: form.magnetFileExtension.trim() || ".magnet",
            watchGracePeriodSeconds: Number(form.watchGracePeriodSeconds),
          }
        : {}),
    }
    const payload = {
      name: form.name.trim(),
      type: form.type,
      host: isBlackhole ? "localhost" : form.host.trim(),
      port: isBlackhole ? 1 : Number(form.port),
      username: isBlackhole ? "" : form.username.trim(),
      useSsl: isBlackhole ? false : form.useSsl,
      category: isBlackhole ? undefined : form.category.trim() || undefined,
      enabled: form.enabled,
      priority: Number(form.priority),
      settings,
    }

    if (form.id === null) {
      add.mutate({ ...payload, password: isBlackhole ? "" : form.password })
      return
    }

    update.mutate({
      id: form.id,
      data: {
        ...payload,
        category: payload.category ?? null,
        ...(form.password.length > 0 ? { password: form.password } : {}),
      },
    })
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Download Clients</h1>
        <p className="text-muted-foreground mt-1">
          Configure download clients used when approved releases are grabbed.
        </p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Configured Clients</h2>
          {clients.isLoading && <p className="text-muted-foreground text-sm">Loading clients...</p>}
          {clients.error && <p className="text-destructive text-sm">{clients.error.message}</p>}
          {clients.data?.length === 0 && (
            <p className="text-muted-foreground text-sm">No download clients configured.</p>
          )}
          {clients.data?.map((client) => (
            <article key={client.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <DownloadCloud className="size-4" />
                    <h3 className="font-medium">{client.name}</h3>
                    <StatusBadge enabled={client.enabled} status={client.health?.status} />
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm break-all">
                    {isBlackholeType(client.type)
                      ? `${client.settings.blackholeFolder ?? client.host} -> ${client.settings.watchFolder ?? client.host}`
                      : `${client.useSsl ? "https" : "http"}://${client.host}:${client.port}`}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {client.type} · priority {client.priority} · {client.category ?? "no category"}{" "}
                    · poll {client.settings.pollIntervalMs}ms
                  </p>
                  {client.health?.errorMessage && (
                    <p className="text-destructive mt-2 text-xs">{client.health.errorMessage}</p>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                    disabled={pending}
                    onClick={() =>
                      setForm({
                        id: client.id,
                        name: client.name,
                        type: client.type,
                        host: client.host,
                        port: String(client.port),
                        username: client.username,
                        password: "",
                        useSsl: client.useSsl,
                        category: client.category ?? "",
                        priority: String(client.priority),
                        pollIntervalMs: String(client.settings.pollIntervalMs),
                        addPaused: client.settings.addPaused ?? false,
                        removeCompletedDownloads: client.settings.removeCompletedDownloads ?? false,
                        removeFailedDownloads: client.settings.removeFailedDownloads ?? false,
                        blackholeFolder:
                          client.settings.blackholeFolder ??
                          blackholeDefaults(client.type).blackholeFolder,
                        watchFolder:
                          client.settings.watchFolder ?? blackholeDefaults(client.type).watchFolder,
                        saveMagnetFiles: client.settings.saveMagnetFiles ?? false,
                        magnetFileExtension: client.settings.magnetFileExtension ?? ".magnet",
                        watchGracePeriodSeconds: String(
                          client.settings.watchGracePeriodSeconds ?? 30,
                        ),
                        enabled: client.enabled,
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
                        id: client.id,
                        data: { enabled: !client.enabled },
                      })
                    }
                  >
                    {client.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
                    disabled={pending}
                    onClick={() => test.mutate({ id: client.id })}
                  >
                    <RefreshCw className="size-3" />
                    Test
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${client.name}`}
                    className="rounded border p-1.5 disabled:opacity-50"
                    disabled={pending}
                    onClick={() => remove.mutate({ id: client.id })}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <form className="h-fit rounded-md border p-4" onSubmit={onSubmit}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {form.id === null ? "Add Download Client" : "Edit Download Client"}
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
                  ? `${selectedType.metadata.displayName} · ${selectedType.metadata.protocolAffinity} · default ${selectedType.metadata.defaultPort}`
                  : undefined
              }
            >
              <select
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={form.type}
                onChange={(event) => {
                  const type = event.target.value
                  const option = typeOptions.find((item) => item.type === type)
                  setForm({
                    ...form,
                    type,
                    port: option ? String(option.metadata.defaultPort) : form.port,
                    ...(isBlackholeType(type) ? blackholeDefaults(type) : {}),
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

            {isBlackhole ? (
              <div className="space-y-4">
                <Field label={form.type === "usenet_blackhole" ? "NZB folder" : "Torrent folder"}>
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={form.blackholeFolder}
                    onChange={(event) => setForm({ ...form, blackholeFolder: event.target.value })}
                    required
                  />
                </Field>
                <Field label="Watch folder">
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={form.watchFolder}
                    onChange={(event) => setForm({ ...form, watchFolder: event.target.value })}
                    required
                  />
                </Field>
                <Field label="Watch grace period" hint="Seconds before a watched item is complete.">
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={form.watchGracePeriodSeconds}
                    onChange={(event) =>
                      setForm({ ...form, watchGracePeriodSeconds: event.target.value })
                    }
                    type="number"
                    min={0}
                    required
                  />
                </Field>
                {form.type === "torrent_blackhole" && (
                  <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.saveMagnetFiles}
                        onChange={(event) =>
                          setForm({ ...form, saveMagnetFiles: event.target.checked })
                        }
                      />
                      Save magnet files
                    </label>
                    <Field label="Magnet extension">
                      <input
                        className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                        value={form.magnetFileExtension}
                        onChange={(event) =>
                          setForm({ ...form, magnetFileExtension: event.target.value })
                        }
                      />
                    </Field>
                  </div>
                )}
              </div>
            ) : (
              <>
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Username">
                    <input
                      className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                      value={form.username}
                      onChange={(event) => setForm({ ...form, username: event.target.value })}
                    />
                  </Field>
                  <Field
                    label="Password"
                    hint={form.id === null ? undefined : "Leave blank to keep the existing secret."}
                  >
                    <input
                      className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                      value={form.password}
                      onChange={(event) => setForm({ ...form, password: event.target.value })}
                      autoComplete="off"
                      required={form.id === null}
                      type="password"
                    />
                  </Field>
                </div>

                <Field label="Category">
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={form.category}
                    onChange={(event) => setForm({ ...form, category: event.target.value })}
                    placeholder="arr-hub"
                  />
                </Field>
              </>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Priority">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: event.target.value })}
                  type="number"
                  min={1}
                  max={100}
                  required
                />
              </Field>
            </div>

            <Field label="Poll interval" hint="Milliseconds between client queue polls.">
              <input
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={form.pollIntervalMs}
                onChange={(event) => setForm({ ...form, pollIntervalMs: event.target.value })}
                type="number"
                min={1000}
                step={1000}
                required
              />
            </Field>

            <div className="flex flex-wrap gap-4">
              {!isBlackhole && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.useSsl}
                    onChange={(event) => setForm({ ...form, useSsl: event.target.checked })}
                  />
                  Use SSL
                </label>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                />
                Enabled
              </label>
              {!isBlackhole && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.addPaused}
                    onChange={(event) => setForm({ ...form, addPaused: event.target.checked })}
                  />
                  Add paused
                </label>
              )}
              {!isBlackhole && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.removeCompletedDownloads}
                    onChange={(event) =>
                      setForm({ ...form, removeCompletedDownloads: event.target.checked })
                    }
                  />
                  Remove completed
                </label>
              )}
              {!isBlackhole && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.removeFailedDownloads}
                    onChange={(event) =>
                      setForm({ ...form, removeFailedDownloads: event.target.checked })
                    }
                  />
                  Remove failed
                </label>
              )}
            </div>

            {message && <p className="text-sm text-emerald-600">{message}</p>}
            {error && <p className="text-destructive text-sm">{error}</p>}

            <button
              type="submit"
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
              disabled={pending}
            >
              <Save className="size-4" />
              {form.id === null ? "Add client" : "Save client"}
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

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
  enabled: true,
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
  const pending = add.isPending || update.isPending || remove.isPending || test.isPending
  const error =
    add.error?.message ?? update.error?.message ?? remove.error?.message ?? test.error?.message

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    const payload = {
      name: form.name.trim(),
      type: form.type,
      host: form.host.trim(),
      port: Number(form.port),
      username: form.username.trim(),
      useSsl: form.useSsl,
      category: form.category.trim() || undefined,
      enabled: form.enabled,
      priority: Number(form.priority),
      settings: { pollIntervalMs: Number(form.pollIntervalMs) },
    }

    if (form.id === null) {
      add.mutate({ ...payload, password: form.password })
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
                    {client.useSsl ? "https" : "http"}://{client.host}:{client.port}
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

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  placeholder="arr-hub"
                />
              </Field>
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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Radio, RefreshCw, Save, Trash2 } from "lucide-react"
import { type FormEvent, type ReactNode, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/indexers")({ component: Indexers })

interface IndexerFormState {
  readonly id: number | null
  readonly name: string
  readonly type: string
  readonly baseUrl: string
  readonly apiKey: string
  readonly priority: string
  readonly minimumSeeders: string
  readonly queryCooldownSeconds: string
  readonly queryLimitCount: string
  readonly queryLimitWindowSeconds: string
  readonly grabLimitCount: string
  readonly grabLimitWindowSeconds: string
  readonly categories: string
  readonly enabled: boolean
}

const emptyForm: IndexerFormState = {
  id: null,
  name: "",
  type: "torznab",
  baseUrl: "",
  apiKey: "",
  priority: "50",
  minimumSeeders: "",
  queryCooldownSeconds: "",
  queryLimitCount: "",
  queryLimitWindowSeconds: "",
  grabLimitCount: "",
  grabLimitWindowSeconds: "",
  categories: "",
  enabled: true,
}

function Indexers() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<IndexerFormState>(emptyForm)
  const [message, setMessage] = useState<string | null>(null)

  const listKey = trpc.indexers.list.queryKey()
  const indexers = useQuery(trpc.indexers.list.queryOptions())
  const types = useQuery(trpc.indexers.listTypes.queryOptions())

  const invalidate = () => queryClient.invalidateQueries({ queryKey: listKey })
  const add = useMutation(
    trpc.indexers.add.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        setForm(emptyForm)
        setMessage("Indexer added.")
      },
    }),
  )
  const update = useMutation(
    trpc.indexers.update.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        setForm(emptyForm)
        setMessage("Indexer updated.")
      },
    }),
  )
  const remove = useMutation(
    trpc.indexers.remove.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        setMessage("Indexer removed.")
      },
    }),
  )
  const test = useMutation(
    trpc.indexers.test.mutationOptions({
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
    const categories = parseCategories(form.categories)
    const priority = Number(form.priority)
    const minimumSeeders = parseOptionalNumber(form.minimumSeeders)
    const queryCooldownSeconds = parseOptionalNumber(form.queryCooldownSeconds)
    const queryLimitCount = parseOptionalNumber(form.queryLimitCount)
    const queryLimitWindowSeconds = parseOptionalNumber(form.queryLimitWindowSeconds)
    const grabLimitCount = parseOptionalNumber(form.grabLimitCount)
    const grabLimitWindowSeconds = parseOptionalNumber(form.grabLimitWindowSeconds)

    if (form.id === null) {
      add.mutate({
        name: form.name.trim(),
        type: form.type,
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey.trim(),
        priority,
        minimumSeeders,
        queryCooldownSeconds,
        queryLimitCount,
        queryLimitWindowSeconds,
        grabLimitCount,
        grabLimitWindowSeconds,
        categories,
        enabled: form.enabled,
      })
      return
    }

    update.mutate({
      id: form.id,
      data: {
        name: form.name.trim(),
        type: form.type,
        baseUrl: form.baseUrl.trim(),
        priority,
        minimumSeeders,
        queryCooldownSeconds,
        queryLimitCount,
        queryLimitWindowSeconds,
        grabLimitCount,
        grabLimitWindowSeconds,
        categories,
        enabled: form.enabled,
        ...(form.apiKey.trim().length > 0 ? { apiKey: form.apiKey.trim() } : {}),
      },
    })
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Indexers</h1>
        <p className="text-muted-foreground mt-1">
          Manage Torznab/Newznab endpoints used for manual and scheduled searches.
        </p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Configured Indexers</h2>
          {indexers.isLoading && (
            <p className="text-muted-foreground text-sm">Loading indexers...</p>
          )}
          {indexers.error && <p className="text-destructive text-sm">{indexers.error.message}</p>}
          {indexers.data?.length === 0 && (
            <p className="text-muted-foreground text-sm">No indexers configured.</p>
          )}
          {indexers.data?.map((indexer) => (
            <article key={indexer.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Radio className="size-4" />
                    <h3 className="font-medium">{indexer.name}</h3>
                    <StatusBadge enabled={indexer.enabled} status={indexer.health?.status} />
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm break-all">{indexer.baseUrl}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {indexer.type} · priority {indexer.priority} ·{" "}
                    {indexer.categories.length > 0
                      ? `${indexer.categories.join(", ")} categories`
                      : "all categories"}
                    {indexer.minimumSeeders !== null
                      ? ` · min ${indexer.minimumSeeders} seeders`
                      : ""}
                    {indexer.queryCooldownSeconds !== null
                      ? ` · ${indexer.queryCooldownSeconds}s cooldown`
                      : ""}
                    {indexer.queryLimitCount !== null && indexer.queryLimitWindowSeconds !== null
                      ? ` · max ${indexer.queryLimitCount}/${indexer.queryLimitWindowSeconds}s`
                      : ""}
                    {indexer.grabLimitCount !== null && indexer.grabLimitWindowSeconds !== null
                      ? ` · max ${indexer.grabLimitCount} grabs/${indexer.grabLimitWindowSeconds}s`
                      : ""}
                  </p>
                  {indexer.health?.errorMessage && (
                    <p className="text-destructive mt-2 text-xs">{indexer.health.errorMessage}</p>
                  )}
                  {indexer.capabilities && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {indexer.capabilities.searchTypes.map((searchType) => (
                        <span key={searchType} className="bg-muted rounded px-2 py-1 text-xs">
                          {searchType}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                    disabled={pending}
                    onClick={() =>
                      setForm({
                        id: indexer.id,
                        name: indexer.name,
                        type: indexer.type,
                        baseUrl: indexer.baseUrl,
                        apiKey: "",
                        priority: String(indexer.priority),
                        minimumSeeders:
                          indexer.minimumSeeders === null ? "" : String(indexer.minimumSeeders),
                        queryCooldownSeconds:
                          indexer.queryCooldownSeconds === null
                            ? ""
                            : String(indexer.queryCooldownSeconds),
                        queryLimitCount:
                          indexer.queryLimitCount === null ? "" : String(indexer.queryLimitCount),
                        queryLimitWindowSeconds:
                          indexer.queryLimitWindowSeconds === null
                            ? ""
                            : String(indexer.queryLimitWindowSeconds),
                        grabLimitCount:
                          indexer.grabLimitCount === null ? "" : String(indexer.grabLimitCount),
                        grabLimitWindowSeconds:
                          indexer.grabLimitWindowSeconds === null
                            ? ""
                            : String(indexer.grabLimitWindowSeconds),
                        categories: indexer.categories.join(", "),
                        enabled: indexer.enabled,
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
                        id: indexer.id,
                        data: { enabled: !indexer.enabled },
                      })
                    }
                  >
                    {indexer.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
                    disabled={pending}
                    onClick={() => test.mutate({ id: indexer.id })}
                  >
                    <RefreshCw className="size-3" />
                    Test
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${indexer.name}`}
                    className="rounded border p-1.5 disabled:opacity-50"
                    disabled={pending}
                    onClick={() => remove.mutate({ id: indexer.id })}
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
              {form.id === null ? "Add Indexer" : "Edit Indexer"}
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
                  ? `${selectedType.metadata.displayName} · ${selectedType.metadata.protocolAffinity} · ${selectedType.metadata.authModel}`
                  : undefined
              }
            >
              <select
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value })}
              >
                {typeOptions.length === 0 && <option value={form.type}>{form.type}</option>}
                {typeOptions.map((type) => (
                  <option key={type.type} value={type.type}>
                    {type.metadata.displayName}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Base URL">
              <input
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={form.baseUrl}
                onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                placeholder="https://indexer.example"
                type="url"
                required
              />
            </Field>

            <Field
              label={form.id === null ? "API key" : "API key"}
              hint={form.id === null ? undefined : "Leave blank to keep the existing secret."}
            >
              <input
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={form.apiKey}
                onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                autoComplete="off"
                required={form.id === null}
                type="password"
              />
            </Field>

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
              <Field label="Minimum seeders">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={form.minimumSeeders}
                  onChange={(event) => setForm({ ...form, minimumSeeders: event.target.value })}
                  type="number"
                  min={0}
                  placeholder="No filter"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Query cooldown">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={form.queryCooldownSeconds}
                  onChange={(event) =>
                    setForm({ ...form, queryCooldownSeconds: event.target.value })
                  }
                  type="number"
                  min={0}
                  placeholder="Seconds"
                />
              </Field>
              <Field label="Query limit">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={form.queryLimitCount}
                  onChange={(event) => setForm({ ...form, queryLimitCount: event.target.value })}
                  type="number"
                  min={0}
                  placeholder="Max queries"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Limit window">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={form.queryLimitWindowSeconds}
                  onChange={(event) =>
                    setForm({ ...form, queryLimitWindowSeconds: event.target.value })
                  }
                  type="number"
                  min={0}
                  placeholder="Seconds"
                />
              </Field>
              <Field label="Grab limit">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={form.grabLimitCount}
                  onChange={(event) => setForm({ ...form, grabLimitCount: event.target.value })}
                  type="number"
                  min={0}
                  placeholder="Max grabs"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Grab window">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={form.grabLimitWindowSeconds}
                  onChange={(event) =>
                    setForm({ ...form, grabLimitWindowSeconds: event.target.value })
                  }
                  type="number"
                  min={0}
                  placeholder="Seconds"
                />
              </Field>
              <label className="mt-7 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                />
                Enabled
              </label>
            </div>

            <Field label="Categories" hint="Comma-separated Torznab/Newznab category IDs.">
              <input
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={form.categories}
                onChange={(event) => setForm({ ...form, categories: event.target.value })}
                placeholder="2000, 5000"
              />
            </Field>

            {message && <p className="text-sm text-emerald-600">{message}</p>}
            {error && <p className="text-destructive text-sm">{error}</p>}

            <button
              type="submit"
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
              disabled={pending}
            >
              <Save className="size-4" />
              {form.id === null ? "Add indexer" : "Save indexer"}
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

function parseCategories(value: string) {
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0)
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

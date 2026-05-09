import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Radio, RefreshCw, Save, Trash2 } from "lucide-react"
import { type FormEvent, type ReactNode, useState } from "react"

import type {
  IndexerAuthField,
  IndexerDefinition,
  IndexerProxy,
  IndexerStats,
} from "#/effect/domain/indexer"
import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/indexers")({ component: Indexers })

type IndexerProxyType = IndexerProxy["type"]

interface IndexerFormState {
  readonly id: number | null
  readonly name: string
  readonly type: string
  readonly definitionKey: string
  readonly baseUrl: string
  readonly apiKey: string
  readonly proxyId: string
  readonly priority: string
  readonly minimumSeeders: string
  readonly queryCooldownSeconds: string
  readonly queryLimitCount: string
  readonly queryLimitWindowSeconds: string
  readonly grabLimitCount: string
  readonly grabLimitWindowSeconds: string
  readonly categories: string
  readonly tags: string
  readonly enabled: boolean
  readonly searchEnabled: boolean
  readonly rssEnabled: boolean
}

const emptyForm: IndexerFormState = {
  id: null,
  name: "",
  type: "torznab",
  definitionKey: "",
  baseUrl: "",
  apiKey: "",
  proxyId: "",
  priority: "50",
  minimumSeeders: "",
  queryCooldownSeconds: "",
  queryLimitCount: "",
  queryLimitWindowSeconds: "",
  grabLimitCount: "",
  grabLimitWindowSeconds: "",
  categories: "",
  tags: "",
  enabled: true,
  searchEnabled: true,
  rssEnabled: true,
}

interface ProxyFormState {
  readonly id: number | null
  readonly name: string
  readonly type: IndexerProxyType
  readonly host: string
  readonly port: string
  readonly username: string
  readonly password: string
  readonly tags: string
  readonly flaresolverrTimeoutMs: string
  readonly enabled: boolean
}

const emptyProxyForm: ProxyFormState = {
  id: null,
  name: "",
  type: "http",
  host: "",
  port: "",
  username: "",
  password: "",
  tags: "",
  flaresolverrTimeoutMs: "",
  enabled: true,
}

const proxyTypeOptions: ReadonlyArray<{ readonly type: IndexerProxyType; readonly label: string }> =
  [
    { type: "http", label: "HTTP" },
    { type: "socks4", label: "SOCKS4" },
    { type: "socks5", label: "SOCKS5" },
    { type: "flaresolverr", label: "FlareSolverr" },
  ]

function Indexers() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<IndexerFormState>(emptyForm)
  const [proxyForm, setProxyForm] = useState<ProxyFormState>(emptyProxyForm)
  const [message, setMessage] = useState<string | null>(null)
  const [proxyMessage, setProxyMessage] = useState<string | null>(null)

  const listKey = trpc.indexers.list.queryKey()
  const proxyListKey = trpc.indexers.listProxies.queryKey()
  const indexers = useQuery(trpc.indexers.list.queryOptions())
  const types = useQuery(trpc.indexers.listTypes.queryOptions())
  const definitions = useQuery(trpc.indexers.listDefinitions.queryOptions())
  const proxies = useQuery(trpc.indexers.listProxies.queryOptions())
  const stats = useQuery(trpc.indexers.listStats.queryOptions())

  const invalidate = () => queryClient.invalidateQueries({ queryKey: listKey })
  const invalidateProxies = () => queryClient.invalidateQueries({ queryKey: proxyListKey })
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
  const addProxy = useMutation(
    trpc.indexers.addProxy.mutationOptions({
      onSuccess: async () => {
        await invalidateProxies()
        setProxyForm(emptyProxyForm)
        setProxyMessage("Indexer proxy added.")
      },
    }),
  )
  const updateProxy = useMutation(
    trpc.indexers.updateProxy.mutationOptions({
      onSuccess: async () => {
        await invalidateProxies()
        setProxyForm(emptyProxyForm)
        setProxyMessage("Indexer proxy updated.")
      },
    }),
  )
  const removeProxy = useMutation(
    trpc.indexers.removeProxy.mutationOptions({
      onSuccess: async () => {
        await Promise.all([invalidateProxies(), invalidate()])
        setProxyMessage("Indexer proxy removed.")
      },
    }),
  )

  const typeOptions = types.data ?? []
  const selectedType = typeOptions.find((item) => item.type === form.type)
  const definitionOptions = definitionOptionsForType(definitions.data ?? [], form.type)
  const selectedDefinitionKey = form.definitionKey || definitionOptions[0]?.definitionKey || ""
  const selectedDefinition =
    definitionOptions.find((definition) => definition.definitionKey === selectedDefinitionKey) ??
    null
  const selectedApiKeyField =
    selectedDefinition?.authFields.find((field) => isApiKeyField(field.name)) ?? null
  const configFields =
    selectedDefinition?.authFields.filter((field) => !isApiKeyField(field.name)) ?? []
  const showDefinitionSelector = form.type === "cardigann_yaml" && definitionOptions.length > 0
  const apiKeyRequired =
    form.id === null &&
    (form.type === "torznab" || form.type === "newznab" || selectedApiKeyField?.required === true)
  const apiKeyHint =
    form.id === null
      ? selectedApiKeyField?.helpText
      : selectedApiKeyField?.helpText
        ? `${selectedApiKeyField.helpText} Leave blank to keep the existing secret.`
        : "Leave blank to keep the existing secret."
  const pending = add.isPending || update.isPending || remove.isPending || test.isPending
  const proxyPending = addProxy.isPending || updateProxy.isPending || removeProxy.isPending
  const error =
    add.error?.message ?? update.error?.message ?? remove.error?.message ?? test.error?.message
  const proxyError =
    addProxy.error?.message ?? updateProxy.error?.message ?? removeProxy.error?.message

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
    const tags = parseTags(form.tags)
    const proxyId = parseProxyId(form.proxyId)
    const configValues = collectConfigValues(new FormData(event.currentTarget), configFields)
    const hasConfigValues = Object.keys(configValues).length > 0
    const definitionKey =
      form.type === "cardigann_yaml" && selectedDefinitionKey.length > 0
        ? selectedDefinitionKey
        : defaultDefinitionKeyForType(form.type)

    if (form.id === null) {
      add.mutate({
        name: form.name.trim(),
        type: form.type,
        ...(definitionKey ? { definitionKey } : {}),
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey.trim(),
        ...(hasConfigValues ? { configValues } : {}),
        proxyId,
        priority,
        minimumSeeders,
        queryCooldownSeconds,
        queryLimitCount,
        queryLimitWindowSeconds,
        grabLimitCount,
        grabLimitWindowSeconds,
        categories,
        tags,
        enabled: form.enabled,
        searchEnabled: form.searchEnabled,
        rssEnabled: form.rssEnabled,
      })
      return
    }

    update.mutate({
      id: form.id,
      data: {
        name: form.name.trim(),
        type: form.type,
        ...(definitionKey ? { definitionKey } : {}),
        baseUrl: form.baseUrl.trim(),
        proxyId,
        priority,
        minimumSeeders,
        queryCooldownSeconds,
        queryLimitCount,
        queryLimitWindowSeconds,
        grabLimitCount,
        grabLimitWindowSeconds,
        categories,
        tags,
        enabled: form.enabled,
        searchEnabled: form.searchEnabled,
        rssEnabled: form.rssEnabled,
        ...(form.apiKey.trim().length > 0 ? { apiKey: form.apiKey.trim() } : {}),
        ...(hasConfigValues ? { configValues } : {}),
      },
    })
  }

  const onProxySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProxyMessage(null)
    const port = parseOptionalPositiveNumber(proxyForm.port)
    const timeout = parseOptionalPositiveNumber(proxyForm.flaresolverrTimeoutMs)
    const settings = {
      tags: parseTags(proxyForm.tags),
      ...(timeout !== null ? { flaresolverrTimeoutMs: timeout } : {}),
    }

    if (proxyForm.id === null) {
      addProxy.mutate({
        name: proxyForm.name.trim(),
        type: proxyForm.type,
        host: proxyForm.host.trim(),
        port,
        username: proxyForm.username.trim().length > 0 ? proxyForm.username.trim() : null,
        password: proxyForm.password,
        enabled: proxyForm.enabled,
        settings,
      })
      return
    }

    updateProxy.mutate({
      id: proxyForm.id,
      data: {
        name: proxyForm.name.trim(),
        type: proxyForm.type,
        host: proxyForm.host.trim(),
        port,
        username: proxyForm.username.trim().length > 0 ? proxyForm.username.trim() : null,
        enabled: proxyForm.enabled,
        settings,
        ...(proxyForm.password.length > 0 ? { password: proxyForm.password } : {}),
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
                    {!indexer.searchEnabled ? " · search off" : ""}
                    {!indexer.rssEnabled ? " · RSS off" : ""}
                    {indexer.proxyId !== null
                      ? ` · proxy ${proxyName(indexer.proxyId, proxies.data ?? [])}`
                      : ""}
                    {indexer.tags.length > 0 ? ` · tags ${indexer.tags.join(", ")}` : ""}
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
                        definitionKey: indexer.definitionKey ?? "",
                        baseUrl: indexer.baseUrl,
                        apiKey: "",
                        proxyId: indexer.proxyId === null ? "" : String(indexer.proxyId),
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
                        tags: indexer.tags.join(", "),
                        enabled: indexer.enabled,
                        searchEnabled: indexer.searchEnabled,
                        rssEnabled: indexer.rssEnabled,
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
                onChange={(event) => {
                  const nextType = event.target.value
                  const nextDefinition = definitionOptionsForType(
                    definitions.data ?? [],
                    nextType,
                  )[0]
                  setForm({
                    ...form,
                    type: nextType,
                    definitionKey: nextDefinition?.definitionKey ?? "",
                    baseUrl:
                      form.baseUrl.trim().length === 0 && nextDefinition?.baseUrl
                        ? nextDefinition.baseUrl
                        : form.baseUrl,
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

            {showDefinitionSelector && (
              <Field
                label="Definition"
                hint={
                  selectedDefinition
                    ? `${selectedDefinition.protocol} · ${selectedDefinition.privacy} · ${selectedDefinition.capabilities.searchTypes.join(", ")}`
                    : undefined
                }
              >
                <select
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={selectedDefinitionKey}
                  onChange={(event) => {
                    const nextDefinition =
                      definitionOptions.find(
                        (definition) => definition.definitionKey === event.target.value,
                      ) ?? null
                    const currentDefaultBaseUrl = selectedDefinition?.baseUrl ?? ""
                    const nextDefaultBaseUrl = nextDefinition?.baseUrl ?? ""
                    setForm({
                      ...form,
                      definitionKey: event.target.value,
                      baseUrl:
                        form.baseUrl.trim().length === 0 ||
                        (currentDefaultBaseUrl.length > 0 && form.baseUrl === currentDefaultBaseUrl)
                          ? nextDefaultBaseUrl
                          : form.baseUrl,
                    })
                  }}
                  required={form.type === "cardigann_yaml"}
                >
                  {definitionOptions.map((definition) => (
                    <option key={definition.definitionKey} value={definition.definitionKey}>
                      {definition.displayName}
                    </option>
                  ))}
                </select>
              </Field>
            )}

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

            <Field label="Proxy" hint="Optional outbound proxy for this indexer.">
              <select
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={form.proxyId}
                onChange={(event) => setForm({ ...form, proxyId: event.target.value })}
              >
                <option value="">No proxy</option>
                {(proxies.data ?? []).map((proxy) => (
                  <option key={proxy.id} value={proxy.id}>
                    {proxyLabel(proxy)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={selectedApiKeyField?.label ?? "API key"} hint={apiKeyHint}>
              <input
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={form.apiKey}
                onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                autoComplete="off"
                required={apiKeyRequired}
                type="password"
              />
            </Field>

            {showDefinitionSelector && configFields.length > 0 && (
              <div key={selectedDefinitionKey} className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium">Definition settings</h3>
                  {form.id !== null && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Leave saved values blank unless they need to change.
                    </p>
                  )}
                </div>
                {configFields.map((field) => (
                  <Field key={field.name} label={field.label} hint={field.helpText}>
                    {field.type === "textarea" ? (
                      <textarea
                        className="mt-1 min-h-24 w-full rounded border bg-transparent px-3 py-2"
                        autoComplete="off"
                        name={configFieldName(field)}
                        required={form.id === null && field.required}
                      />
                    ) : (
                      <input
                        className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                        autoComplete="off"
                        name={configFieldName(field)}
                        required={form.id === null && field.required}
                        type={configFieldInputType(field)}
                      />
                    )}
                  </Field>
                ))}
              </div>
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
              <div className="mt-7 flex flex-wrap gap-4">
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
                    checked={form.searchEnabled}
                    onChange={(event) => setForm({ ...form, searchEnabled: event.target.checked })}
                  />
                  Search
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.rssEnabled}
                    onChange={(event) => setForm({ ...form, rssEnabled: event.target.checked })}
                  />
                  RSS
                </label>
              </div>
            </div>

            <Field label="Categories" hint="Comma-separated Torznab/Newznab category IDs.">
              <input
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={form.categories}
                onChange={(event) => setForm({ ...form, categories: event.target.value })}
                placeholder="2000, 5000"
              />
            </Field>

            <Field label="Tags" hint="Comma-separated tags.">
              <input
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={form.tags}
                onChange={(event) => setForm({ ...form, tags: event.target.value })}
                placeholder="anime, public"
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

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Indexer Proxies</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage HTTP, SOCKS, and FlareSolverr proxies for indexer requests.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-3">
            {proxies.isLoading && (
              <p className="text-muted-foreground text-sm">Loading indexer proxies...</p>
            )}
            {proxies.error && <p className="text-destructive text-sm">{proxies.error.message}</p>}
            {proxies.data?.length === 0 && (
              <p className="text-muted-foreground text-sm">No indexer proxies configured.</p>
            )}
            {proxies.data?.map((proxy) => (
              <article key={proxy.id} className="rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{proxy.name}</h3>
                      <StatusBadge enabled={proxy.enabled} />
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm break-all">
                      {proxy.type} · {proxy.host}
                      {proxy.port !== null ? `:${proxy.port}` : ""}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {proxy.username ? `user ${proxy.username}` : "no username"}
                      {proxy.settings.flaresolverrTimeoutMs
                        ? ` · timeout ${proxy.settings.flaresolverrTimeoutMs}ms`
                        : ""}
                      {proxy.settings.tags && proxy.settings.tags.length > 0
                        ? ` · tags ${proxy.settings.tags.join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                      disabled={proxyPending}
                      onClick={() =>
                        setProxyForm({
                          id: proxy.id,
                          name: proxy.name,
                          type: proxy.type,
                          host: proxy.host,
                          port: proxy.port === null ? "" : String(proxy.port),
                          username: proxy.username ?? "",
                          password: "",
                          tags: proxy.settings.tags?.join(", ") ?? "",
                          flaresolverrTimeoutMs:
                            proxy.settings.flaresolverrTimeoutMs === undefined
                              ? ""
                              : String(proxy.settings.flaresolverrTimeoutMs),
                          enabled: proxy.enabled,
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                      disabled={proxyPending}
                      onClick={() =>
                        updateProxy.mutate({
                          id: proxy.id,
                          data: { enabled: !proxy.enabled },
                        })
                      }
                    >
                      {proxy.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${proxy.name}`}
                      className="rounded border p-1.5 disabled:opacity-50"
                      disabled={proxyPending}
                      onClick={() => removeProxy.mutate({ id: proxy.id })}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <form className="h-fit rounded-md border p-4" onSubmit={onProxySubmit}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {proxyForm.id === null ? "Add Proxy" : "Edit Proxy"}
              </h2>
              {proxyForm.id !== null && (
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => setProxyForm(emptyProxyForm)}
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="mt-4 space-y-4">
              <Field label="Name">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={proxyForm.name}
                  onChange={(event) => setProxyForm({ ...proxyForm, name: event.target.value })}
                  required
                />
              </Field>

              <Field label="Type">
                <select
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={proxyForm.type}
                  onChange={(event) =>
                    setProxyForm({
                      ...proxyForm,
                      type: event.target.value as IndexerProxyType,
                    })
                  }
                >
                  {proxyTypeOptions.map((option) => (
                    <option key={option.type} value={option.type}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Host">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={proxyForm.host}
                  onChange={(event) => setProxyForm({ ...proxyForm, host: event.target.value })}
                  placeholder="proxy.local"
                  required
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Port">
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={proxyForm.port}
                    onChange={(event) => setProxyForm({ ...proxyForm, port: event.target.value })}
                    type="number"
                    min={1}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Timeout">
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={proxyForm.flaresolverrTimeoutMs}
                    onChange={(event) =>
                      setProxyForm({ ...proxyForm, flaresolverrTimeoutMs: event.target.value })
                    }
                    type="number"
                    min={1}
                    placeholder="FlareSolverr ms"
                  />
                </Field>
              </div>

              <Field label="Username">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={proxyForm.username}
                  onChange={(event) => setProxyForm({ ...proxyForm, username: event.target.value })}
                  autoComplete="off"
                />
              </Field>

              <Field
                label="Password"
                hint={
                  proxyForm.id === null ? undefined : "Leave blank to keep the existing secret."
                }
              >
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={proxyForm.password}
                  onChange={(event) => setProxyForm({ ...proxyForm, password: event.target.value })}
                  autoComplete="off"
                  type="password"
                />
              </Field>

              <Field label="Tags" hint="Comma-separated proxy tags.">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={proxyForm.tags}
                  onChange={(event) => setProxyForm({ ...proxyForm, tags: event.target.value })}
                  placeholder="cloudflare, public-trackers"
                />
              </Field>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={proxyForm.enabled}
                  onChange={(event) =>
                    setProxyForm({ ...proxyForm, enabled: event.target.checked })
                  }
                />
                Enabled
              </label>

              {proxyMessage && <p className="text-sm text-emerald-600">{proxyMessage}</p>}
              {proxyError && <p className="text-destructive text-sm">{proxyError}</p>}

              <button
                type="submit"
                className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
                disabled={proxyPending}
              >
                <Save className="size-4" />
                {proxyForm.id === null ? "Add proxy" : "Save proxy"}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Indexer Stats</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Inspect search, RSS, grab, response-time, and rate-limit window counters.
          </p>
        </div>

        {stats.isLoading && (
          <p className="text-muted-foreground text-sm">Loading indexer stats...</p>
        )}
        {stats.error && <p className="text-destructive text-sm">{stats.error.message}</p>}
        {stats.data?.length === 0 && (
          <p className="text-muted-foreground text-sm">No indexer statistics recorded yet.</p>
        )}
        {stats.data && stats.data.length > 0 && (
          <div className="grid gap-3 xl:grid-cols-2">
            {stats.data.map((item) => (
              <article key={item.indexerId} className="rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{item.indexerName}</h3>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Avg response {formatMilliseconds(item.averageResponseTimeMs)}
                    </p>
                  </div>
                  <span className="bg-muted rounded px-2 py-1 text-xs">#{item.indexerId}</span>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <Stat
                    label="Searches"
                    value={formatSuccessRatio(item.successfulSearches, item.totalSearches)}
                  />
                  <Stat label="RSS" value={formatSuccessRatio(item.successfulRss, item.totalRss)} />
                  <Stat label="Grabs" value={String(item.totalGrabs)} />
                </div>
                <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
                  <Stat label="Last search" value={formatDateTime(item.lastSearchAt)} />
                  <Stat label="Last RSS" value={formatDateTime(item.lastRssAt)} />
                  <Stat label="Last grab" value={formatDateTime(item.lastGrabAt)} />
                </div>
                <div className="text-muted-foreground mt-4 text-xs">
                  Query window {item.queryLimitWindowSearches} searches since{" "}
                  {formatDateTime(item.queryLimitWindowStartedAt)} · grab window{" "}
                  {item.grabLimitWindowGrabs} grabs since{" "}
                  {formatDateTime(item.grabLimitWindowStartedAt)}
                </div>
              </article>
            ))}
          </div>
        )}
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

function Stat(props: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{props.label}</p>
      <p className="font-medium">{props.value}</p>
    </div>
  )
}

function parseCategories(value: string) {
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0)
}

function parseTags(value: string): Array<string> {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  )
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

function parseOptionalPositiveNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseProxyId(value: string): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function proxyName(id: number, proxies: ReadonlyArray<IndexerProxy>): string {
  return proxies.find((proxy) => proxy.id === id)?.name ?? `#${id}`
}

function proxyLabel(proxy: IndexerProxy): string {
  return `${proxy.name} · ${proxy.type} · ${proxy.host}${proxy.port === null ? "" : `:${proxy.port}`}`
}

function formatSuccessRatio(successes: number, total: number): string {
  return `${successes}/${total}`
}

function formatMilliseconds(value: number | null): string {
  return value === null ? "n/a" : `${value}ms`
}

function formatDateTime(value: IndexerStats["lastSearchAt"]): string {
  if (value === null) return "never"
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? "never" : date.toLocaleString()
}

function definitionOptionsForType(
  definitions: ReadonlyArray<IndexerDefinition>,
  type: string,
): ReadonlyArray<IndexerDefinition> {
  if (type !== "cardigann_yaml") return []
  return definitions
    .filter((definition) => definition.implementation === type)
    .toSorted((a, b) => a.displayName.localeCompare(b.displayName))
}

function defaultDefinitionKeyForType(type: string): string | null {
  if (type === "torznab") return "generic-torznab"
  if (type === "newznab") return "generic-newznab"
  return null
}

function isApiKeyField(name: string): boolean {
  return /^api_?key$/i.test(name)
}

function collectConfigValues(
  values: FormData,
  fields: ReadonlyArray<IndexerAuthField>,
): Record<string, string> {
  const collected: Record<string, string> = {}
  for (const field of fields) {
    const value = values.get(configFieldName(field))
    if (typeof value === "string" && value.trim().length > 0) collected[field.name] = value
  }
  return collected
}

function configFieldName(field: IndexerAuthField): string {
  return `configValues.${field.name}`
}

function configFieldInputType(field: IndexerAuthField): "password" | "text" {
  return field.type === "password" || field.type === "cookie" ? "password" : "text"
}

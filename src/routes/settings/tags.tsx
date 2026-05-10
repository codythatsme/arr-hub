import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Filter, Play, Plus, Tags, Trash2, Wand2 } from "lucide-react"
import { type FormEvent, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/tags")({ component: TagsSettings })

type AutoTaggingMediaType = "movie" | "series" | "both"
type CustomFilterType = "movie" | "series"

function splitValues(value: string): Array<string> {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function TagsSettings() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [label, setLabel] = useState("")
  const [ruleName, setRuleName] = useState("")
  const [ruleMediaType, setRuleMediaType] = useState<AutoTaggingMediaType>("both")
  const [ruleTags, setRuleTags] = useState("")
  const [ruleGenre, setRuleGenre] = useState("")
  const [ruleStatus, setRuleStatus] = useState("")
  const [ruleMonitored, setRuleMonitored] = useState("any")
  const [ruleYear, setRuleYear] = useState("")
  const [ruleRootFolder, setRuleRootFolder] = useState("")
  const [ruleQualityProfileId, setRuleQualityProfileId] = useState("")
  const [ruleRemoveTags, setRuleRemoveTags] = useState(false)
  const [filterLabel, setFilterLabel] = useState("")
  const [filterType, setFilterType] = useState<CustomFilterType>("movie")
  const [filterTags, setFilterTags] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterMonitored, setFilterMonitored] = useState("any")
  const [message, setMessage] = useState<string | null>(null)
  const tagsKey = trpc.tags.list.queryKey()
  const autoTagsKey = trpc.tags.listAutoTaggingRules.queryKey()
  const customFiltersKey = trpc.tags.listCustomFilters.queryKey()
  const tags = useQuery(trpc.tags.list.queryOptions())
  const autoTags = useQuery(trpc.tags.listAutoTaggingRules.queryOptions())
  const customFilters = useQuery(trpc.tags.listCustomFilters.queryOptions())
  const createTag = useMutation(
    trpc.tags.create.mutationOptions({
      onSuccess: async (result) => {
        setLabel("")
        setMessage(`Tag ${result.tag.label} saved.`)
        await queryClient.invalidateQueries({ queryKey: tagsKey })
      },
    }),
  )
  const removeTag = useMutation(
    trpc.tags.remove.mutationOptions({
      onSuccess: async () => {
        setMessage("Tag removed.")
        await queryClient.invalidateQueries({ queryKey: tagsKey })
      },
    }),
  )
  const createRule = useMutation(
    trpc.tags.createAutoTaggingRule.mutationOptions({
      onSuccess: async (result) => {
        setRuleName("")
        setRuleTags("")
        setRuleGenre("")
        setRuleStatus("")
        setRuleMonitored("any")
        setRuleYear("")
        setRuleRootFolder("")
        setRuleQualityProfileId("")
        setRuleRemoveTags(false)
        setMessage(`Auto-tagging rule ${result.name} saved.`)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: autoTagsKey }),
          queryClient.invalidateQueries({ queryKey: tagsKey }),
        ])
      },
    }),
  )
  const removeRule = useMutation(
    trpc.tags.removeAutoTaggingRule.mutationOptions({
      onSuccess: async () => {
        setMessage("Auto-tagging rule removed.")
        await queryClient.invalidateQueries({ queryKey: autoTagsKey })
      },
    }),
  )
  const applyRules = useMutation(
    trpc.tags.applyAutoTaggingRules.mutationOptions({
      onSuccess: async (result) => {
        setMessage(
          `Auto-tagging applied to ${result.moviesChanged} movie${result.moviesChanged === 1 ? "" : "s"} and ${result.seriesChanged} series.`,
        )
        await queryClient.invalidateQueries()
      },
    }),
  )
  const createFilter = useMutation(
    trpc.tags.createCustomFilter.mutationOptions({
      onSuccess: async (result) => {
        setFilterLabel("")
        setFilterTags("")
        setFilterStatus("")
        setFilterMonitored("any")
        setMessage(`Custom filter ${result.label} saved.`)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: customFiltersKey }),
          queryClient.invalidateQueries({ queryKey: tagsKey }),
        ])
      },
    }),
  )
  const removeFilter = useMutation(
    trpc.tags.removeCustomFilter.mutationOptions({
      onSuccess: async () => {
        setMessage("Custom filter removed.")
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: customFiltersKey }),
          queryClient.invalidateQueries({ queryKey: tagsKey }),
        ])
      },
    }),
  )

  const pending =
    createTag.isPending ||
    removeTag.isPending ||
    createRule.isPending ||
    removeRule.isPending ||
    applyRules.isPending ||
    createFilter.isPending ||
    removeFilter.isPending
  const error =
    createTag.error?.message ??
    removeTag.error?.message ??
    createRule.error?.message ??
    removeRule.error?.message ??
    applyRules.error?.message ??
    createFilter.error?.message ??
    removeFilter.error?.message ??
    tags.error?.message ??
    autoTags.error?.message ??
    customFilters.error?.message

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    createTag.mutate({ label })
  }

  const submitRule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)

    const specifications: Array<{
      type: "genre" | "status" | "monitored" | "year" | "rootFolderPath" | "qualityProfileId"
      value: string | number | boolean | Array<string>
    }> = []
    const genres = splitValues(ruleGenre)
    if (genres.length > 0) specifications.push({ type: "genre", value: genres })
    if (ruleStatus.trim()) specifications.push({ type: "status", value: ruleStatus.trim() })
    if (ruleMonitored !== "any") {
      specifications.push({ type: "monitored", value: ruleMonitored === "true" })
    }
    if (ruleYear.trim()) specifications.push({ type: "year", value: Number(ruleYear) })
    if (ruleRootFolder.trim()) {
      specifications.push({ type: "rootFolderPath", value: ruleRootFolder.trim() })
    }
    if (ruleQualityProfileId.trim()) {
      specifications.push({ type: "qualityProfileId", value: Number(ruleQualityProfileId) })
    }

    createRule.mutate({
      name: ruleName,
      mediaType: ruleMediaType,
      tags: splitValues(ruleTags),
      specifications,
      removeTagsAutomatically: ruleRemoveTags,
    })
  }

  const submitFilter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    createFilter.mutate({
      type: filterType,
      label: filterLabel,
      filters: {
        tags: splitValues(filterTags),
        status: filterStatus.trim() || null,
        monitored: filterMonitored === "any" ? null : filterMonitored === "true",
      },
    })
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Tags</h1>
        <p className="text-muted-foreground mt-1">Shared labels for media and indexer policies</p>
      </header>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      <form className="rounded-md border p-4" onSubmit={submit}>
        <h2 className="text-lg font-semibold">Create Tag</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="min-w-64 flex-1 text-sm">
            <span className="font-medium">Label</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="anime"
              required
            />
          </label>
          <button
            type="submit"
            className="bg-primary text-primary-foreground mt-6 inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
            disabled={pending || label.trim().length === 0}
          >
            <Plus className="size-4" />
            Add tag
          </button>
        </div>
      </form>

      <form className="rounded-md border p-4" onSubmit={submitRule}>
        <div className="flex items-center gap-2">
          <Wand2 className="size-4" />
          <h2 className="text-lg font-semibold">Auto Tagging</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            <span className="font-medium">Name</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={ruleName}
              onChange={(event) => setRuleName(event.target.value)}
              placeholder="Anime releases"
              required
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Media</span>
            <select
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={ruleMediaType}
              onChange={(event) => setRuleMediaType(event.target.value as AutoTaggingMediaType)}
            >
              <option value="both">Movies + TV</option>
              <option value="movie">Movies</option>
              <option value="series">TV</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">Tags</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={ruleTags}
              onChange={(event) => setRuleTags(event.target.value)}
              placeholder="anime, preferred"
              required
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Genre</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={ruleGenre}
              onChange={(event) => setRuleGenre(event.target.value)}
              placeholder="Animation"
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Status</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={ruleStatus}
              onChange={(event) => setRuleStatus(event.target.value)}
              placeholder="wanted"
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Monitored</span>
            <select
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={ruleMonitored}
              onChange={(event) => setRuleMonitored(event.target.value)}
            >
              <option value="any">Any</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">Year</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              type="number"
              value={ruleYear}
              onChange={(event) => setRuleYear(event.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Root folder</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={ruleRootFolder}
              onChange={(event) => setRuleRootFolder(event.target.value)}
              placeholder="/movies"
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Profile ID</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              type="number"
              value={ruleQualityProfileId}
              onChange={(event) => setRuleQualityProfileId(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ruleRemoveTags}
              onChange={(event) => setRuleRemoveTags(event.target.checked)}
            />
            <span>Remove when unmatched</span>
          </label>
          <button
            type="submit"
            className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
            disabled={pending || !ruleName.trim() || splitValues(ruleTags).length === 0}
          >
            <Plus className="size-4" />
            Add rule
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
            disabled={pending}
            onClick={() => {
              setMessage(null)
              applyRules.mutate()
            }}
          >
            <Play className="size-4" />
            Apply rules
          </button>
        </div>
      </form>

      <section className="rounded-md border">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Wand2 className="size-4" />
          <h2 className="font-semibold">Auto Tagging Rules</h2>
        </div>
        <div className="divide-y">
          {autoTags.isLoading && (
            <p className="text-muted-foreground p-4 text-sm">Loading auto-tagging rules...</p>
          )}
          {autoTags.data?.length === 0 && (
            <p className="text-muted-foreground p-4 text-sm">
              No auto-tagging rules have been created.
            </p>
          )}
          {autoTags.data?.map((rule) => (
            <div
              key={rule.id}
              className="grid items-center gap-3 p-4 text-sm lg:grid-cols-[1fr_auto_auto_auto]"
            >
              <span className="font-medium">{rule.name}</span>
              <span className="text-muted-foreground">{rule.mediaType}</span>
              <span className="text-muted-foreground">{rule.tags.join(", ")}</span>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
                disabled={pending}
                onClick={() => {
                  setMessage(null)
                  removeRule.mutate({ id: rule.id })
                }}
              >
                <Trash2 className="size-4" />
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>

      <form className="rounded-md border p-4" onSubmit={submitFilter}>
        <div className="flex items-center gap-2">
          <Filter className="size-4" />
          <h2 className="text-lg font-semibold">Custom Filters</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <label className="text-sm md:col-span-2">
            <span className="font-medium">Label</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={filterLabel}
              onChange={(event) => setFilterLabel(event.target.value)}
              placeholder="Unmonitored anime"
              required
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Type</span>
            <select
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={filterType}
              onChange={(event) => setFilterType(event.target.value as CustomFilterType)}
            >
              <option value="movie">Movies</option>
              <option value="series">TV</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">Status</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              placeholder="wanted"
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Monitored</span>
            <select
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={filterMonitored}
              onChange={(event) => setFilterMonitored(event.target.value)}
            >
              <option value="any">Any</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="text-sm md:col-span-4">
            <span className="font-medium">Tags</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={filterTags}
              onChange={(event) => setFilterTags(event.target.value)}
              placeholder="anime, backlog"
            />
          </label>
          <button
            type="submit"
            className="bg-primary text-primary-foreground mt-6 inline-flex items-center justify-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
            disabled={pending || !filterLabel.trim()}
          >
            <Plus className="size-4" />
            Add filter
          </button>
        </div>
      </form>

      <section className="rounded-md border">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Filter className="size-4" />
          <h2 className="font-semibold">Saved Filters</h2>
        </div>
        <div className="divide-y">
          {customFilters.isLoading && (
            <p className="text-muted-foreground p-4 text-sm">Loading custom filters...</p>
          )}
          {customFilters.data?.length === 0 && (
            <p className="text-muted-foreground p-4 text-sm">No custom filters have been saved.</p>
          )}
          {customFilters.data?.map((filter) => (
            <div
              key={filter.id}
              className="grid items-center gap-3 p-4 text-sm lg:grid-cols-[1fr_auto_auto_auto]"
            >
              <span className="font-medium">{filter.label}</span>
              <span className="text-muted-foreground">{filter.type}</span>
              <span className="text-muted-foreground">
                {filter.filters.tags?.join(", ") ?? "No tags"}
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
                disabled={pending}
                onClick={() => {
                  setMessage(null)
                  removeFilter.mutate({ id: filter.id })
                }}
              >
                <Trash2 className="size-4" />
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Tags className="size-4" />
          <h2 className="font-semibold">Tag Library</h2>
        </div>
        <div className="divide-y">
          {tags.isLoading && <p className="text-muted-foreground p-4 text-sm">Loading tags...</p>}
          {tags.data?.length === 0 && (
            <p className="text-muted-foreground p-4 text-sm">No tags have been created.</p>
          )}
          {tags.data?.map((item) => (
            <div
              key={item.tag.id}
              className="grid items-center gap-3 p-4 text-sm sm:grid-cols-[1fr_auto_auto]"
            >
              <span className="font-medium">{item.tag.label}</span>
              <span className="text-muted-foreground">
                {item.usageCount} use{item.usageCount === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
                disabled={pending || item.usageCount > 0}
                onClick={() => {
                  setMessage(null)
                  removeTag.mutate({ id: item.tag.id })
                }}
              >
                <Trash2 className="size-4" />
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

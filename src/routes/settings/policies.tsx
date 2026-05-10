import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Plus, Trash2 } from "lucide-react"
import { type FormEvent, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/policies")({ component: Policies })

interface PolicyListRow {
  readonly id: number
  readonly name: string
  readonly tags: ReadonlyArray<string>
}

const EMPTY_POLICY_ROWS: ReadonlyArray<PolicyListRow> = []

const splitList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const number = Number(trimmed)
  return Number.isFinite(number) ? number : null
}

function Policies() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const [importListName, setImportListName] = useState("")
  const [importListType, setImportListType] = useState("custom")
  const [importListTags, setImportListTags] = useState("")
  const [releaseProfileName, setReleaseProfileName] = useState("")
  const [releaseRequired, setReleaseRequired] = useState("")
  const [releaseIgnored, setReleaseIgnored] = useState("")
  const [releaseTags, setReleaseTags] = useState("")
  const [releaseExcludedTags, setReleaseExcludedTags] = useState("")
  const [delayProfileName, setDelayProfileName] = useState("")
  const [delayTags, setDelayTags] = useState("")
  const [torrentDelay, setTorrentDelay] = useState("0")
  const [usenetDelay, setUsenetDelay] = useState("0")

  const importListsKey = trpc.policies.listImportLists.queryKey()
  const releaseProfilesKey = trpc.policies.listReleaseProfiles.queryKey()
  const delayProfilesKey = trpc.policies.listDelayProfiles.queryKey()
  const importLists = useQuery(trpc.policies.listImportLists.queryOptions())
  const releaseProfiles = useQuery(trpc.policies.listReleaseProfiles.queryOptions())
  const delayProfiles = useQuery(trpc.policies.listDelayProfiles.queryOptions())

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: importListsKey }),
      queryClient.invalidateQueries({ queryKey: releaseProfilesKey }),
      queryClient.invalidateQueries({ queryKey: delayProfilesKey }),
    ])
  }

  const createImportList = useMutation(
    trpc.policies.createImportList.mutationOptions({
      onSuccess: async (list) => {
        await invalidate()
        setImportListName("")
        setImportListTags("")
        setMessage(`Created import list ${list.name}.`)
      },
    }),
  )
  const removeImportList = useMutation(
    trpc.policies.removeImportList.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        setMessage("Import list removed.")
      },
    }),
  )
  const createReleaseProfile = useMutation(
    trpc.policies.createReleaseProfile.mutationOptions({
      onSuccess: async (profile) => {
        await invalidate()
        setReleaseProfileName("")
        setReleaseRequired("")
        setReleaseIgnored("")
        setReleaseTags("")
        setReleaseExcludedTags("")
        setMessage(`Created release profile ${profile.name}.`)
      },
    }),
  )
  const removeReleaseProfile = useMutation(
    trpc.policies.removeReleaseProfile.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        setMessage("Release profile removed.")
      },
    }),
  )
  const createDelayProfile = useMutation(
    trpc.policies.createDelayProfile.mutationOptions({
      onSuccess: async (profile) => {
        await invalidate()
        setDelayProfileName("")
        setDelayTags("")
        setTorrentDelay("0")
        setUsenetDelay("0")
        setMessage(`Created delay profile ${profile.name}.`)
      },
    }),
  )
  const removeDelayProfile = useMutation(
    trpc.policies.removeDelayProfile.mutationOptions({
      onSuccess: async () => {
        await invalidate()
        setMessage("Delay profile removed.")
      },
    }),
  )

  const error =
    createImportList.error?.message ??
    removeImportList.error?.message ??
    createReleaseProfile.error?.message ??
    removeReleaseProfile.error?.message ??
    createDelayProfile.error?.message ??
    removeDelayProfile.error?.message ??
    importLists.error?.message ??
    releaseProfiles.error?.message ??
    delayProfiles.error?.message

  const submitImportList = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    createImportList.mutate({
      name: importListName,
      type: importListType as "trakt" | "tmdb" | "rss" | "plex" | "radarr" | "sonarr" | "custom",
      tags: splitList(importListTags),
    })
  }

  const submitReleaseProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    createReleaseProfile.mutate({
      name: releaseProfileName,
      requiredTerms: splitList(releaseRequired),
      ignoredTerms: splitList(releaseIgnored),
      tags: splitList(releaseTags),
      excludedTags: splitList(releaseExcludedTags),
    })
  }

  const submitDelayProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    createDelayProfile.mutate({
      name: delayProfileName,
      torrentDelayMinutes: parseOptionalNumber(torrentDelay) ?? 0,
      usenetDelayMinutes: parseOptionalNumber(usenetDelay) ?? 0,
      tags: splitList(delayTags),
    })
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Policies</h1>
        <p className="text-muted-foreground mt-1">
          Manage first-pass import list, release profile, and delay profile tag scopes.
        </p>
      </header>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="space-y-4 rounded-md border p-4">
          <h2 className="font-semibold">Import Lists</h2>
          <form className="space-y-3" onSubmit={submitImportList}>
            <input
              className="bg-background w-full rounded border px-3 py-2 text-sm"
              placeholder="Name"
              value={importListName}
              onChange={(event) => setImportListName(event.target.value)}
            />
            <select
              className="bg-background w-full rounded border px-3 py-2 text-sm"
              value={importListType}
              onChange={(event) => setImportListType(event.target.value)}
            >
              <option value="custom">Custom</option>
              <option value="trakt">Trakt</option>
              <option value="tmdb">TMDB</option>
              <option value="rss">RSS</option>
              <option value="plex">Plex</option>
              <option value="radarr">Radarr</option>
              <option value="sonarr">Sonarr</option>
            </select>
            <input
              className="bg-background w-full rounded border px-3 py-2 text-sm"
              placeholder="Tags, comma-separated"
              value={importListTags}
              onChange={(event) => setImportListTags(event.target.value)}
            />
            <button
              type="submit"
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
              disabled={createImportList.isPending}
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </form>
          <PolicyList
            rows={importLists.data ?? EMPTY_POLICY_ROWS}
            emptyLabel="No import lists"
            onDelete={(id) => removeImportList.mutate({ id })}
          />
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="font-semibold">Release Profiles</h2>
          <form className="space-y-3" onSubmit={submitReleaseProfile}>
            <input
              className="bg-background w-full rounded border px-3 py-2 text-sm"
              placeholder="Name"
              value={releaseProfileName}
              onChange={(event) => setReleaseProfileName(event.target.value)}
            />
            <input
              className="bg-background w-full rounded border px-3 py-2 text-sm"
              placeholder="Required terms"
              value={releaseRequired}
              onChange={(event) => setReleaseRequired(event.target.value)}
            />
            <input
              className="bg-background w-full rounded border px-3 py-2 text-sm"
              placeholder="Ignored terms"
              value={releaseIgnored}
              onChange={(event) => setReleaseIgnored(event.target.value)}
            />
            <input
              className="bg-background w-full rounded border px-3 py-2 text-sm"
              placeholder="Include tags"
              value={releaseTags}
              onChange={(event) => setReleaseTags(event.target.value)}
            />
            <input
              className="bg-background w-full rounded border px-3 py-2 text-sm"
              placeholder="Exclude tags"
              value={releaseExcludedTags}
              onChange={(event) => setReleaseExcludedTags(event.target.value)}
            />
            <button
              type="submit"
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
              disabled={createReleaseProfile.isPending}
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </form>
          <PolicyList
            rows={releaseProfiles.data ?? EMPTY_POLICY_ROWS}
            emptyLabel="No release profiles"
            onDelete={(id) => removeReleaseProfile.mutate({ id })}
          />
        </section>

        <section className="space-y-4 rounded-md border p-4">
          <h2 className="font-semibold">Delay Profiles</h2>
          <form className="space-y-3" onSubmit={submitDelayProfile}>
            <input
              className="bg-background w-full rounded border px-3 py-2 text-sm"
              placeholder="Name"
              value={delayProfileName}
              onChange={(event) => setDelayProfileName(event.target.value)}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="bg-background w-full rounded border px-3 py-2 text-sm"
                placeholder="Torrent delay"
                value={torrentDelay}
                onChange={(event) => setTorrentDelay(event.target.value)}
              />
              <input
                className="bg-background w-full rounded border px-3 py-2 text-sm"
                placeholder="Usenet delay"
                value={usenetDelay}
                onChange={(event) => setUsenetDelay(event.target.value)}
              />
            </div>
            <input
              className="bg-background w-full rounded border px-3 py-2 text-sm"
              placeholder="Tags, comma-separated"
              value={delayTags}
              onChange={(event) => setDelayTags(event.target.value)}
            />
            <button
              type="submit"
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
              disabled={createDelayProfile.isPending}
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </form>
          <PolicyList
            rows={delayProfiles.data ?? EMPTY_POLICY_ROWS}
            emptyLabel="No delay profiles"
            onDelete={(id) => removeDelayProfile.mutate({ id })}
          />
        </section>
      </div>
    </div>
  )
}

function PolicyList({
  rows,
  emptyLabel,
  onDelete,
}: {
  readonly rows: ReadonlyArray<PolicyListRow>
  readonly emptyLabel: string
  readonly onDelete: (id: number) => void
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyLabel}</p>
  }

  return (
    <div className="divide-y rounded-md border">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3 p-3 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{row.name}</p>
            <p className="text-muted-foreground truncate">{row.tags.join(", ") || "No tags"}</p>
          </div>
          <button
            type="button"
            className="text-destructive inline-flex items-center rounded border p-2"
            onClick={() => onDelete(row.id)}
            aria-label={`Delete ${row.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

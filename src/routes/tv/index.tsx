import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { createFileRoute } from "@tanstack/react-router"
import { Plus, Trash2 } from "lucide-react"
import { type FormEvent, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/tv/")({ component: TvShows })

type SeriesStatus = "continuing" | "ended" | "wanted" | "available"
type StatusFilter = "all" | SeriesStatus
type MonitoredFilter = "all" | "monitored" | "unmonitored"

function TvShows() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<StatusFilter>("all")
  const [monitored, setMonitored] = useState<MonitoredFilter>("all")
  const [tvdbId, setTvdbId] = useState("")
  const [title, setTitle] = useState("")
  const [year, setYear] = useState("")
  const [network, setNetwork] = useState("")
  const [overview, setOverview] = useState("")
  const [addStatus, setAddStatus] = useState<SeriesStatus>("wanted")
  const [qualityProfileId, setQualityProfileId] = useState("")
  const [rootFolderPath, setRootFolderPath] = useState("")
  const [seasonNumber, setSeasonNumber] = useState("1")
  const [episodeCount, setEpisodeCount] = useState("0")
  const [firstEpisodeTvdbId, setFirstEpisodeTvdbId] = useState("")
  const [seasonFolder, setSeasonFolder] = useState(true)
  const [monitoredOnAdd, setMonitoredOnAdd] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const filters = {
    status: status === "all" ? undefined : status,
    monitored: monitored === "all" ? undefined : monitored === "monitored",
  }
  const listKey = trpc.series.list.queryKey(filters)
  const query = useQuery(trpc.series.list.queryOptions(filters))
  const profiles = useQuery(trpc.profiles.list.queryOptions())
  const rootFolders = useQuery(trpc.rootFolders.list.queryOptions())
  const invalidateSeries = () => queryClient.invalidateQueries({ queryKey: listKey })
  const addSeries = useMutation(
    trpc.series.add.mutationOptions({
      onSuccess: async (result) => {
        await invalidateSeries()
        setMessage(`Added ${result.series.title}.`)
        setTitle("")
        setOverview("")
      },
    }),
  )
  const updateSeries = useMutation(
    trpc.series.update.mutationOptions({
      onSuccess: async (result) => {
        await invalidateSeries()
        setMessage(`${result.series.title} updated.`)
      },
    }),
  )
  const removeSeries = useMutation(
    trpc.series.remove.mutationOptions({
      onSuccess: async () => {
        await invalidateSeries()
        setMessage("Series removed.")
      },
    }),
  )

  const pending = addSeries.isPending || updateSeries.isPending || removeSeries.isPending
  const error =
    formError ??
    addSeries.error?.message ??
    updateSeries.error?.message ??
    removeSeries.error?.message ??
    query.error?.message ??
    profiles.error?.message ??
    rootFolders.error?.message

  const submitSeries = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setFormError(null)

    const parsedTvdbId = Number(tvdbId)
    if (!Number.isInteger(parsedTvdbId) || parsedTvdbId <= 0) {
      setFormError("TVDB ID must be a positive whole number.")
      return
    }

    const parsedYear = year.trim().length > 0 ? Number(year) : null
    if (parsedYear !== null && (!Number.isInteger(parsedYear) || parsedYear < 1900)) {
      setFormError("Year must be a valid whole number.")
      return
    }

    const parsedSeasonNumber = seasonNumber.trim().length > 0 ? Number(seasonNumber) : null
    if (
      parsedSeasonNumber !== null &&
      (!Number.isInteger(parsedSeasonNumber) || parsedSeasonNumber < 0)
    ) {
      setFormError("Season number must be zero or greater.")
      return
    }

    const parsedEpisodeCount = episodeCount.trim().length > 0 ? Number(episodeCount) : 0
    if (!Number.isInteger(parsedEpisodeCount) || parsedEpisodeCount < 0) {
      setFormError("Episode count must be zero or greater.")
      return
    }

    const parsedFirstEpisodeTvdbId =
      firstEpisodeTvdbId.trim().length > 0
        ? Number(firstEpisodeTvdbId)
        : parsedTvdbId * 10_000 + (parsedSeasonNumber ?? 0) * 100 + 1
    if (
      parsedEpisodeCount > 0 &&
      (!Number.isInteger(parsedFirstEpisodeTvdbId) || parsedFirstEpisodeTvdbId <= 0)
    ) {
      setFormError("First episode TVDB ID must be a positive whole number.")
      return
    }

    const episodes =
      parsedEpisodeCount > 0
        ? Array.from({ length: parsedEpisodeCount }, (_, index) => ({
            tvdbId: parsedFirstEpisodeTvdbId + index,
            title: `Episode ${index + 1}`,
            episodeNumber: index + 1,
            airDate: null,
            overview: null,
            monitored: monitoredOnAdd,
          }))
        : undefined
    const seasons =
      parsedSeasonNumber === null
        ? undefined
        : [{ seasonNumber: parsedSeasonNumber, monitored: monitoredOnAdd, episodes }]

    addSeries.mutate({
      tvdbId: parsedTvdbId,
      title: title.trim(),
      year: parsedYear,
      overview: overview.trim().length > 0 ? overview.trim() : null,
      status: addStatus,
      network: network.trim().length > 0 ? network.trim() : null,
      rootFolderPath: rootFolderPath.length > 0 ? rootFolderPath : null,
      monitored: monitoredOnAdd,
      qualityProfileId: qualityProfileId.length > 0 ? Number(qualityProfileId) : null,
      seasonFolder,
      seasons,
    })
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">TV Shows</h1>
          <p className="text-muted-foreground mt-1">Browse, add, and manage TV shows.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            className="bg-background rounded border px-2 py-1"
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="continuing">Continuing</option>
            <option value="ended">Ended</option>
            <option value="wanted">Wanted</option>
            <option value="available">Available</option>
          </select>
          <select
            className="bg-background rounded border px-2 py-1"
            value={monitored}
            onChange={(event) => setMonitored(event.target.value as MonitoredFilter)}
          >
            <option value="all">All monitoring</option>
            <option value="monitored">Monitored</option>
            <option value="unmonitored">Unmonitored</option>
          </select>
        </div>
      </header>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          {query.isLoading && <p className="text-muted-foreground text-sm">Loading TV shows...</p>}
          {query.data?.length === 0 && (
            <p className="text-muted-foreground text-sm">No TV shows match the current filters.</p>
          )}
          {query.data && query.data.length > 0 && (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Root</th>
                    <th className="px-3 py-2 text-right font-medium">Network</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.map((show) => (
                    <tr key={show.id} className="border-t">
                      <td className="px-3 py-2">
                        <Link
                          to="/tv/$id"
                          params={{ id: String(show.id) }}
                          className="font-medium hover:underline"
                        >
                          {show.title}
                          {show.year ? ` (${show.year})` : ""}
                        </Link>
                        <p className="text-muted-foreground text-xs">
                          {show.monitored ? "monitored" : "unmonitored"}
                        </p>
                      </td>
                      <td className="px-3 py-2">{show.status}</td>
                      <td className="max-w-64 px-3 py-2">
                        <p className="truncate font-mono text-xs">
                          {show.rootFolderPath ?? "unset"}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right">{show.network ?? "unknown"}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                            disabled={pending}
                            onClick={() =>
                              updateSeries.mutate({
                                id: show.id,
                                data: { monitored: !show.monitored },
                              })
                            }
                          >
                            {show.monitored ? "Unmonitor" : "Monitor"}
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${show.title}`}
                            className="rounded border p-1.5 disabled:opacity-50"
                            disabled={pending}
                            onClick={() => removeSeries.mutate({ id: show.id })}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <form className="rounded-md border p-4" onSubmit={submitSeries}>
          <h2 className="text-lg font-semibold">Add TV Show</h2>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <label className="block text-sm">
                <span className="font-medium">TVDB ID</span>
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={tvdbId}
                  onChange={(event) => setTvdbId(event.target.value)}
                  type="number"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Title</span>
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium">Year</span>
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                  type="number"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Status</span>
                <select
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={addStatus}
                  onChange={(event) => setAddStatus(event.target.value as SeriesStatus)}
                >
                  <option value="wanted">Wanted</option>
                  <option value="continuing">Continuing</option>
                  <option value="ended">Ended</option>
                  <option value="available">Available</option>
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="font-medium">Network</span>
              <input
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={network}
                onChange={(event) => setNetwork(event.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Overview</span>
              <textarea
                className="mt-1 min-h-24 w-full rounded border bg-transparent px-3 py-2"
                value={overview}
                onChange={(event) => setOverview(event.target.value)}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <label className="block text-sm">
                <span className="font-medium">Quality profile</span>
                <select
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={qualityProfileId}
                  onChange={(event) => setQualityProfileId(event.target.value)}
                >
                  <option value="">None</option>
                  {(profiles.data ?? []).map((item) => (
                    <option key={item.profile.id} value={item.profile.id}>
                      {item.profile.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium">Root folder</span>
                <select
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={rootFolderPath}
                  onChange={(event) => setRootFolderPath(event.target.value)}
                >
                  <option value="">Unset</option>
                  {(rootFolders.data ?? []).map((folder) => (
                    <option key={folder.id} value={folder.path}>
                      {folder.path}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="font-medium">Season</span>
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={seasonNumber}
                  onChange={(event) => setSeasonNumber(event.target.value)}
                  type="number"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Episodes</span>
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={episodeCount}
                  onChange={(event) => setEpisodeCount(event.target.value)}
                  type="number"
                  min={0}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">First ep TVDB</span>
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={firstEpisodeTvdbId}
                  onChange={(event) => setFirstEpisodeTvdbId(event.target.value)}
                  type="number"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={monitoredOnAdd}
                  onChange={(event) => setMonitoredOnAdd(event.target.checked)}
                />
                Monitor when added
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={seasonFolder}
                  onChange={(event) => setSeasonFolder(event.target.checked)}
                />
                Use season folders
              </label>
            </div>
            <button
              type="submit"
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
              disabled={pending}
            >
              <Plus className="size-4" />
              Add show
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

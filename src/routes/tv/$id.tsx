import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Download, Save, Search, Trash2 } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/tv/$id")({
  component: SeriesDetail,
})

type SeriesStatus = "continuing" | "ended" | "wanted" | "available"
type ReleaseDecision = "accepted" | "rejected" | "upgrade" | "skipped"

interface DecisionRow {
  readonly candidate: {
    readonly title: string
    readonly indexerName: string
    readonly size: number
    readonly seeders: number | null
    readonly age: number
    readonly downloadUrl: string
  }
  readonly decision: ReleaseDecision
  readonly qualityRank: number | null
  readonly formatScore: number
  readonly reasons: ReadonlyArray<{ readonly rule: string; readonly detail: string }>
}

function SeriesDetail() {
  const { id } = Route.useParams()
  const seriesId = Number(id)
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [title, setTitle] = useState("")
  const [year, setYear] = useState("")
  const [status, setStatus] = useState<SeriesStatus>("wanted")
  const [network, setNetwork] = useState("")
  const [overview, setOverview] = useState("")
  const [qualityProfileId, setQualityProfileId] = useState("")
  const [rootFolderPath, setRootFolderPath] = useState("")
  const [monitored, setMonitored] = useState(true)
  const [seasonFolder, setSeasonFolder] = useState(true)
  const [selectedSeasonId, setSelectedSeasonId] = useState("")
  const [selectedEpisodeId, setSelectedEpisodeId] = useState("")
  const [decisionEpisodeId, setDecisionEpisodeId] = useState<number | null>(null)
  const [decisions, setDecisions] = useState<ReadonlyArray<DecisionRow>>([])
  const [message, setMessage] = useState<string | null>(null)

  const seriesKey = trpc.series.get.queryKey({ id: seriesId })
  const historyKey = trpc.history.getForSeries.queryKey({ seriesId })
  const series = useQuery(trpc.series.get.queryOptions({ id: seriesId }))
  const history = useQuery(
    trpc.history.getForSeries.queryOptions({ seriesId }, { enabled: seriesId > 0 }),
  )
  const profiles = useQuery(trpc.profiles.list.queryOptions())
  const rootFolders = useQuery(trpc.rootFolders.list.queryOptions())

  const invalidateSeries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: seriesKey }),
      queryClient.invalidateQueries({ queryKey: historyKey }),
    ])
  }
  const updateSeries = useMutation(
    trpc.series.update.mutationOptions({
      onSuccess: async (updated) => {
        await invalidateSeries()
        setMessage(`${updated.series.title} saved.`)
      },
    }),
  )
  const removeSeries = useMutation(
    trpc.series.remove.mutationOptions({
      onSuccess: async () => {
        await navigate({ to: "/tv" })
      },
    }),
  )
  const toggleSeason = useMutation(
    trpc.series.toggleSeasonMonitor.mutationOptions({
      onSuccess: async (season) => {
        await invalidateSeries()
        setMessage(`Season ${season.season.seasonNumber} updated.`)
      },
    }),
  )
  const toggleEpisode = useMutation(
    trpc.series.toggleEpisodeMonitor.mutationOptions({
      onSuccess: async (episode) => {
        await invalidateSeries()
        setMessage(`${episode.title} updated.`)
      },
    }),
  )
  const searchSeries = useMutation(
    trpc.series.searchSeries.mutationOptions({
      onSuccess: (result) => {
        setMessage(`Queued ${result.length} release${result.length === 1 ? "" : "s"}.`)
      },
    }),
  )
  const searchSeason = useMutation(
    trpc.series.searchSeason.mutationOptions({
      onSuccess: (result) => {
        setMessage(`Queued ${result.length} release${result.length === 1 ? "" : "s"}.`)
      },
    }),
  )
  const evaluateEpisode = useMutation(
    trpc.series.evaluateEpisode.mutationOptions({
      onSuccess: (result) => {
        setDecisions(result)
        setMessage(`Manual search returned ${result.length} releases.`)
      },
    }),
  )
  const grabEpisode = useMutation(
    trpc.series.grabEpisode.mutationOptions({
      onSuccess: (result) => {
        setMessage(`Grabbed ${result.candidateTitle}.`)
      },
    }),
  )

  useEffect(() => {
    if (!series.data) return
    setTitle(series.data.series.title)
    setYear(series.data.series.year === null ? "" : String(series.data.series.year))
    setStatus(series.data.series.status)
    setNetwork(series.data.series.network ?? "")
    setOverview(series.data.series.overview ?? "")
    setQualityProfileId(
      series.data.series.qualityProfileId === null
        ? ""
        : String(series.data.series.qualityProfileId),
    )
    setRootFolderPath(series.data.series.rootFolderPath ?? "")
    setMonitored(series.data.series.monitored)
    setSeasonFolder(series.data.series.seasonFolder)
    setSelectedSeasonId((current) => current || String(series.data.seasons[0]?.season.id ?? ""))
    setSelectedEpisodeId((current) => {
      const firstEpisode = series.data.seasons.flatMap((season) => season.episodes)[0]
      return current || String(firstEpisode?.id ?? "")
    })
  }, [series.data])

  const pending =
    updateSeries.isPending ||
    removeSeries.isPending ||
    toggleSeason.isPending ||
    toggleEpisode.isPending ||
    searchSeries.isPending ||
    searchSeason.isPending ||
    evaluateEpisode.isPending ||
    grabEpisode.isPending
  const error =
    updateSeries.error?.message ??
    removeSeries.error?.message ??
    toggleSeason.error?.message ??
    toggleEpisode.error?.message ??
    searchSeries.error?.message ??
    searchSeason.error?.message ??
    evaluateEpisode.error?.message ??
    grabEpisode.error?.message ??
    series.error?.message ??
    profiles.error?.message ??
    rootFolders.error?.message

  const saveSeries = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    updateSeries.mutate({
      id: seriesId,
      data: {
        title: title.trim(),
        year: year.trim().length > 0 ? Number(year) : null,
        status,
        network: network.trim().length > 0 ? network.trim() : null,
        overview: overview.trim().length > 0 ? overview.trim() : null,
        qualityProfileId: qualityProfileId.length > 0 ? Number(qualityProfileId) : null,
        rootFolderPath: rootFolderPath.length > 0 ? rootFolderPath : null,
        monitored,
        seasonFolder,
      },
    })
  }

  const searchEpisode = (episodeId: number) => {
    setMessage(null)
    setDecisionEpisodeId(episodeId)
    setSelectedEpisodeId(String(episodeId))
    setDecisions([])
    evaluateEpisode.mutate({ episodeId })
  }

  return (
    <div className="space-y-6 p-6">
      <Link to="/tv" className="text-muted-foreground text-sm hover:underline">
        Back to TV
      </Link>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {series.isLoading && <p className="text-muted-foreground text-sm">Loading show...</p>}
      {series.data && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">
                {series.data.series.title}
                {series.data.series.year ? ` (${series.data.series.year})` : ""}
              </h1>
              <p className="text-muted-foreground text-sm">
                {series.data.series.status} ·{" "}
                {series.data.series.monitored ? "monitored" : "unmonitored"}
                {series.data.series.network ? ` · ${series.data.series.network}` : ""}
              </p>
              {series.data.series.overview && (
                <p className="max-w-3xl text-sm">{series.data.series.overview}</p>
              )}
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
              disabled={pending}
              onClick={() => removeSeries.mutate({ id: seriesId })}
            >
              <Trash2 className="size-4" />
              Delete
            </button>
          </header>

          <section className="grid gap-3 sm:grid-cols-4">
            <Metric label="Seasons" value={String(series.data.seasons.length)} />
            <Metric
              label="Episodes"
              value={String(
                series.data.seasons.reduce((total, season) => total + season.episodeCount, 0),
              )}
            />
            <Metric
              label="Available"
              value={String(
                series.data.seasons.reduce((total, season) => total + season.availableCount, 0),
              )}
            />
            <Metric label="Root" value={series.data.series.rootFolderPath ?? "unset"} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
            <form className="rounded-md border p-4" onSubmit={saveSeries}>
              <h2 className="text-lg font-semibold">Edit TV Show</h2>
              <div className="mt-4 space-y-4">
                <label className="block text-sm">
                  <span className="font-medium">Title</span>
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                  />
                </label>
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
                      value={status}
                      onChange={(event) => setStatus(event.target.value as SeriesStatus)}
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
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={monitored}
                      onChange={(event) => setMonitored(event.target.checked)}
                    />
                    Monitored
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
                  <Save className="size-4" />
                  Save show
                </button>
              </div>
            </form>

            <section className="space-y-4">
              <div className="rounded-md border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Manual Search</h2>
                    <p className="text-muted-foreground text-sm">
                      Search the whole show, a season, or evaluate a selected episode.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
                    disabled={pending}
                    onClick={() => {
                      setMessage(null)
                      searchSeries.mutate({ id: seriesId })
                    }}
                  >
                    <Search className="size-4" />
                    Search show
                  </button>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="block text-sm">
                    <span className="font-medium">Season</span>
                    <div className="mt-1 flex gap-2">
                      <select
                        className="w-full rounded border bg-transparent px-3 py-2"
                        value={selectedSeasonId}
                        onChange={(event) => setSelectedSeasonId(event.target.value)}
                      >
                        {series.data.seasons.map((season) => (
                          <option key={season.season.id} value={season.season.id}>
                            Season {season.season.seasonNumber}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
                        disabled={pending || selectedSeasonId.length === 0}
                        onClick={() => {
                          setMessage(null)
                          searchSeason.mutate({ seasonId: Number(selectedSeasonId) })
                        }}
                      >
                        Search
                      </button>
                    </div>
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium">Episode</span>
                    <div className="mt-1 flex gap-2">
                      <select
                        className="w-full rounded border bg-transparent px-3 py-2"
                        value={selectedEpisodeId}
                        onChange={(event) => setSelectedEpisodeId(event.target.value)}
                      >
                        {series.data.seasons.flatMap((season) =>
                          season.episodes.map((episode) => (
                            <option key={episode.id} value={episode.id}>
                              S{season.season.seasonNumber}E{episode.episodeNumber} ·{" "}
                              {episode.title}
                            </option>
                          )),
                        )}
                      </select>
                      <button
                        type="button"
                        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
                        disabled={pending || selectedEpisodeId.length === 0}
                        onClick={() => searchEpisode(Number(selectedEpisodeId))}
                      >
                        Search
                      </button>
                    </div>
                  </label>
                </div>
              </div>

              {decisions.length > 0 && (
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Release</th>
                        <th className="px-3 py-2 text-left font-medium">Decision</th>
                        <th className="px-3 py-2 text-right font-medium">Score</th>
                        <th className="px-3 py-2 text-right font-medium">Size</th>
                        <th className="px-3 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decisions.map((decision) => (
                        <tr key={decision.candidate.downloadUrl} className="border-t align-top">
                          <td className="max-w-lg px-3 py-2">
                            <p className="truncate font-medium">{decision.candidate.title}</p>
                            <p className="text-muted-foreground text-xs">
                              {decision.candidate.indexerName} · seeders{" "}
                              {decision.candidate.seeders ?? "n/a"} · age {decision.candidate.age}d
                            </p>
                            {decision.reasons.length > 0 && (
                              <p className="text-muted-foreground mt-1 text-xs">
                                {decision.reasons.map((reason) => reason.detail).join("; ")}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2">{decision.decision}</td>
                          <td className="px-3 py-2 text-right">{decision.formatScore}</td>
                          <td className="px-3 py-2 text-right">
                            {formatBytes(decision.candidate.size)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
                              disabled={pending || decisionEpisodeId === null}
                              onClick={() =>
                                decisionEpisodeId !== null &&
                                grabEpisode.mutate({
                                  episodeId: decisionEpisodeId,
                                  downloadUrl: decision.candidate.downloadUrl,
                                  candidateTitle: decision.candidate.title,
                                })
                              }
                            >
                              <Download className="size-3" />
                              Grab
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Seasons & Episodes</h2>
            {series.data.seasons.length === 0 && (
              <p className="text-muted-foreground text-sm">No seasons have been added yet.</p>
            )}
            <div className="space-y-4">
              {series.data.seasons.map((season) => (
                <article key={season.season.id} className="rounded-md border">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
                    <div>
                      <h3 className="font-medium">Season {season.season.seasonNumber}</h3>
                      <p className="text-muted-foreground text-xs">
                        {season.availableCount}/{season.episodeCount} available ·{" "}
                        {season.season.monitored ? "monitored" : "unmonitored"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                        disabled={pending}
                        onClick={() =>
                          toggleSeason.mutate({
                            seasonId: season.season.id,
                            monitored: !season.season.monitored,
                          })
                        }
                      >
                        {season.season.monitored ? "Unmonitor" : "Monitor"}
                      </button>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                        disabled={pending}
                        onClick={() => {
                          setMessage(null)
                          setSelectedSeasonId(String(season.season.id))
                          searchSeason.mutate({ seasonId: season.season.id })
                        }}
                      >
                        Search
                      </button>
                    </div>
                  </div>
                  {season.episodes.length > 0 && (
                    <div className="overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Episode</th>
                            <th className="px-3 py-2 text-left font-medium">Status</th>
                            <th className="px-3 py-2 text-left font-medium">Monitor</th>
                            <th className="px-3 py-2 text-right font-medium">Quality</th>
                            <th className="px-3 py-2 text-right font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {season.episodes.map((episode) => (
                            <tr key={episode.id} className="border-t">
                              <td className="px-3 py-2">
                                S{season.season.seasonNumber}E{episode.episodeNumber} ·{" "}
                                {episode.title}
                              </td>
                              <td className="px-3 py-2">
                                {episode.hasFile ? "available" : "missing"}
                              </td>
                              <td className="px-3 py-2">
                                {episode.monitored ? "monitored" : "unmonitored"}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {episode.existingQualityName ?? "none"}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                                    disabled={pending}
                                    onClick={() =>
                                      toggleEpisode.mutate({
                                        episodeId: episode.id,
                                        monitored: !episode.monitored,
                                      })
                                    }
                                  >
                                    {episode.monitored ? "Unmonitor" : "Monitor"}
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                                    disabled={pending}
                                    onClick={() => searchEpisode(episode.id)}
                                  >
                                    Search
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      <WatchHistory rows={history.data ?? []} loading={history.isLoading} />
    </div>
  )
}

function Metric(props: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{props.label}</p>
      <p className="mt-1 truncate font-medium">{props.value}</p>
    </div>
  )
}

function WatchHistory(props: {
  readonly rows: ReadonlyArray<{
    readonly episodeTitle: string
    readonly seasonNumber: number
    readonly episodeNumber: number
    readonly history: {
      readonly id: number
      readonly plexUsername: string
      readonly stoppedAt: Date
      readonly viewOffset: number
      readonly duration: number
      readonly transcodeDecision: string
      readonly player: string
    }
  }>
  readonly loading: boolean
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Watched By</h2>
      {props.loading && <p className="text-muted-foreground text-sm">Loading watch history...</p>}
      {!props.loading && props.rows.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No Plex watch history linked to this series.
        </p>
      )}
      {props.rows.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Episode</th>
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Progress</th>
                <th className="px-3 py-2 text-left font-medium">Playback</th>
                <th className="px-3 py-2 text-right font-medium">Watched</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row) => (
                <tr key={row.history.id} className="border-t">
                  <td className="px-3 py-2">
                    S{row.seasonNumber}E{row.episodeNumber} · {row.episodeTitle}
                  </td>
                  <td className="px-3 py-2">{row.history.plexUsername}</td>
                  <td className="px-3 py-2">
                    {formatPercent(row.history.viewOffset, row.history.duration)}
                  </td>
                  <td className="px-3 py-2">
                    {row.history.transcodeDecision} · {row.history.player}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {new Date(row.history.stoppedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function formatPercent(viewOffset: number, duration: number) {
  if (duration <= 0) return "unknown"
  return `${Math.round((viewOffset / duration) * 100)}%`
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

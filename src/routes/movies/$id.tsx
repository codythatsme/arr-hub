import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Download, Save, Search, Trash2 } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/movies/$id")({
  component: MovieDetail,
})

type MovieStatus = "wanted" | "available" | "missing"
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

function MovieDetail() {
  const { id } = Route.useParams()
  const movieId = Number(id)
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [title, setTitle] = useState("")
  const [year, setYear] = useState("")
  const [status, setStatus] = useState<MovieStatus>("wanted")
  const [qualityProfileId, setQualityProfileId] = useState("")
  const [rootFolderPath, setRootFolderPath] = useState("")
  const [monitored, setMonitored] = useState(true)
  const [decisions, setDecisions] = useState<ReadonlyArray<DecisionRow>>([])
  const [message, setMessage] = useState<string | null>(null)

  const movieKey = trpc.movies.get.queryKey({ id: movieId })
  const historyKey = trpc.history.getForMedia.queryKey({ kind: "movie", movieId })
  const movie = useQuery(trpc.movies.get.queryOptions({ id: movieId }))
  const history = useQuery(
    trpc.history.getForMedia.queryOptions({ kind: "movie", movieId }, { enabled: movieId > 0 }),
  )
  const profiles = useQuery(trpc.profiles.list.queryOptions())
  const rootFolders = useQuery(trpc.rootFolders.list.queryOptions())

  const invalidateMovie = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: movieKey }),
      queryClient.invalidateQueries({ queryKey: historyKey }),
    ])
  }
  const updateMovie = useMutation(
    trpc.movies.update.mutationOptions({
      onSuccess: async (updated) => {
        await invalidateMovie()
        setMessage(`${updated.title} saved.`)
      },
    }),
  )
  const removeMovie = useMutation(
    trpc.movies.remove.mutationOptions({
      onSuccess: async () => {
        await navigate({ to: "/movies" })
      },
    }),
  )
  const searchMovie = useMutation(
    trpc.movies.search.mutationOptions({
      onSuccess: (result) => {
        setDecisions(result)
        setMessage(`Manual search returned ${result.length} releases.`)
      },
    }),
  )
  const grabMovie = useMutation(
    trpc.movies.grab.mutationOptions({
      onSuccess: (result) => {
        setMessage(`Grabbed ${result.candidateTitle}.`)
      },
    }),
  )

  useEffect(() => {
    if (!movie.data) return
    setTitle(movie.data.title)
    setYear(movie.data.year === null ? "" : String(movie.data.year))
    setStatus(movie.data.status)
    setQualityProfileId(
      movie.data.qualityProfileId === null ? "" : String(movie.data.qualityProfileId),
    )
    setRootFolderPath(movie.data.rootFolderPath ?? "")
    setMonitored(movie.data.monitored)
  }, [movie.data])

  const pending =
    updateMovie.isPending || removeMovie.isPending || searchMovie.isPending || grabMovie.isPending
  const error =
    updateMovie.error?.message ??
    removeMovie.error?.message ??
    searchMovie.error?.message ??
    grabMovie.error?.message ??
    movie.error?.message ??
    profiles.error?.message ??
    rootFolders.error?.message

  const saveMovie = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    updateMovie.mutate({
      id: movieId,
      data: {
        title: title.trim(),
        year: year.trim().length > 0 ? Number(year) : null,
        status,
        qualityProfileId: qualityProfileId.length > 0 ? Number(qualityProfileId) : null,
        rootFolderPath: rootFolderPath.length > 0 ? rootFolderPath : null,
        monitored,
      },
    })
  }

  return (
    <div className="space-y-6 p-6">
      <Link to="/movies" className="text-muted-foreground text-sm hover:underline">
        Back to movies
      </Link>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {movie.isLoading && <p className="text-muted-foreground text-sm">Loading movie...</p>}
      {movie.data && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">
                {movie.data.title}
                {movie.data.year ? ` (${movie.data.year})` : ""}
              </h1>
              <p className="text-muted-foreground text-sm">
                {movie.data.status} · {movie.data.monitored ? "monitored" : "unmonitored"}
              </p>
              {movie.data.overview && <p className="max-w-3xl text-sm">{movie.data.overview}</p>}
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
              disabled={pending}
              onClick={() => removeMovie.mutate({ id: movieId })}
            >
              <Trash2 className="size-4" />
              Delete
            </button>
          </header>

          <section className="grid gap-3 sm:grid-cols-3">
            <Metric label="File" value={movie.data.hasFile ? "available" : "missing"} />
            <Metric label="Quality" value={movie.data.existingQualityName ?? "none"} />
            <Metric
              label="Format score"
              value={String(movie.data.existingFormatScore ?? "unknown")}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
            <form className="rounded-md border p-4" onSubmit={saveMovie}>
              <h2 className="text-lg font-semibold">Edit Movie</h2>
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
                      onChange={(event) => setStatus(event.target.value as MovieStatus)}
                    >
                      <option value="wanted">Wanted</option>
                      <option value="available">Available</option>
                      <option value="missing">Missing</option>
                    </select>
                  </label>
                </div>
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
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={monitored}
                    onChange={(event) => setMonitored(event.target.checked)}
                  />
                  Monitored
                </label>
                <button
                  type="submit"
                  className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
                  disabled={pending}
                >
                  <Save className="size-4" />
                  Save movie
                </button>
              </div>
            </form>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Manual Search</h2>
                  <p className="text-muted-foreground text-sm">
                    Evaluate releases with the current profile, then grab a selected result.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
                  disabled={pending}
                  onClick={() => {
                    setMessage(null)
                    searchMovie.mutate({ id: movieId })
                  }}
                >
                  <Search className="size-4" />
                  Search
                </button>
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
                              disabled={pending}
                              onClick={() =>
                                grabMovie.mutate({
                                  id: movieId,
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
      <p className="mt-1 font-medium">{props.value}</p>
    </div>
  )
}

function WatchHistory(props: {
  readonly rows: ReadonlyArray<{
    readonly id: number
    readonly plexUsername: string
    readonly stoppedAt: Date
    readonly viewOffset: number
    readonly duration: number
    readonly transcodeDecision: string
    readonly player: string
  }>
  readonly loading: boolean
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Watched By</h2>
      {props.loading && <p className="text-muted-foreground text-sm">Loading watch history...</p>}
      {!props.loading && props.rows.length === 0 && (
        <p className="text-muted-foreground text-sm">No Plex watch history linked to this movie.</p>
      )}
      {props.rows.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Progress</th>
                <th className="px-3 py-2 text-left font-medium">Playback</th>
                <th className="px-3 py-2 text-right font-medium">Watched</th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">{row.plexUsername}</td>
                  <td className="px-3 py-2">{formatPercent(row.viewOffset, row.duration)}</td>
                  <td className="px-3 py-2">
                    {row.transcodeDecision} · {row.player}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {new Date(row.stoppedAt).toLocaleString()}
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
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

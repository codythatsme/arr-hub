import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/movies/$id")({
  component: MovieDetail,
})

function MovieDetail() {
  const { id } = Route.useParams()
  const movieId = Number(id)
  const trpc = useTRPC()
  const movie = useQuery(trpc.movies.get.queryOptions({ id: movieId }))
  const history = useQuery(
    trpc.history.getForMedia.queryOptions({ kind: "movie", movieId }, { enabled: movieId > 0 }),
  )

  return (
    <div className="space-y-6 p-6">
      <Link to="/movies" className="text-muted-foreground text-sm hover:underline">
        Back to movies
      </Link>

      {movie.isLoading && <p className="text-muted-foreground text-sm">Loading movie...</p>}
      {movie.error && <p className="text-destructive text-sm">{movie.error.message}</p>}
      {movie.data && (
        <>
          <header className="space-y-2">
            <div>
              <h1 className="text-2xl font-bold">
                {movie.data.title}
                {movie.data.year ? ` (${movie.data.year})` : ""}
              </h1>
              <p className="text-muted-foreground text-sm">
                {movie.data.status} · {movie.data.monitored ? "monitored" : "unmonitored"}
              </p>
            </div>
            {movie.data.overview && <p className="max-w-3xl text-sm">{movie.data.overview}</p>}
          </header>

          <section className="grid gap-3 sm:grid-cols-3">
            <Metric label="File" value={movie.data.hasFile ? "available" : "missing"} />
            <Metric label="Quality" value={movie.data.existingQualityName ?? "none"} />
            <Metric
              label="Format score"
              value={String(movie.data.existingFormatScore ?? "unknown")}
            />
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

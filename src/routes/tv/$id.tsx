import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/tv/$id")({
  component: SeriesDetail,
})

function SeriesDetail() {
  const { id } = Route.useParams()
  const seriesId = Number(id)
  const trpc = useTRPC()
  const series = useQuery(trpc.series.get.queryOptions({ id: seriesId }))
  const history = useQuery(
    trpc.history.getForSeries.queryOptions({ seriesId }, { enabled: seriesId > 0 }),
  )

  return (
    <div className="space-y-6 p-6">
      <Link to="/tv" className="text-muted-foreground text-sm hover:underline">
        Back to TV
      </Link>

      {series.isLoading && <p className="text-muted-foreground text-sm">Loading show...</p>}
      {series.error && <p className="text-destructive text-sm">{series.error.message}</p>}
      {series.data && (
        <>
          <header className="space-y-2">
            <div>
              <h1 className="text-2xl font-bold">
                {series.data.series.title}
                {series.data.series.year ? ` (${series.data.series.year})` : ""}
              </h1>
              <p className="text-muted-foreground text-sm">
                {series.data.series.status} ·{" "}
                {series.data.series.monitored ? "monitored" : "unmonitored"}
              </p>
            </div>
            {series.data.series.overview && (
              <p className="max-w-3xl text-sm">{series.data.series.overview}</p>
            )}
          </header>

          <section className="grid gap-3 sm:grid-cols-3">
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
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Episodes</h2>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Episode</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {series.data.seasons.flatMap((season) =>
                    season.episodes.map((episode) => (
                      <tr key={episode.id} className="border-t">
                        <td className="px-3 py-2">
                          S{season.season.seasonNumber}E{episode.episodeNumber} · {episode.title}
                        </td>
                        <td className="px-3 py-2">{episode.hasFile ? "available" : "missing"}</td>
                        <td className="px-3 py-2 text-right">
                          {episode.existingQualityName ?? "none"}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
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
      <p className="mt-1 font-medium">{props.value}</p>
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

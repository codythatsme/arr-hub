import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/activity/history")({ component: History })

type MediaTypeFilter = "all" | "movie" | "episode"

function History() {
  const trpc = useTRPC()
  const [mediaType, setMediaType] = useState<MediaTypeFilter>("all")
  const [cursor, setCursor] = useState<number | null>(null)
  const [stack, setStack] = useState<ReadonlyArray<number | null>>([])

  const query = useQuery(
    trpc.history.list.queryOptions({
      cursor,
      limit: 50,
      filters: mediaType === "all" ? undefined : { mediaType },
    }),
  )

  const onMediaTypeChange = (next: MediaTypeFilter) => {
    setMediaType(next)
    setCursor(null)
    setStack([])
  }

  const onNext = () => {
    if (query.data?.nextCursor === null || query.data?.nextCursor === undefined) return
    setStack((s) => [...s, cursor])
    setCursor(query.data.nextCursor)
  }

  const onPrev = () => {
    if (stack.length === 0) return
    const prev = stack[stack.length - 1] ?? null
    setStack((s) => s.slice(0, -1))
    setCursor(prev)
  }

  return (
    <div className="p-6">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">History</h1>
          <p className="text-muted-foreground mt-1">Playback session history</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="mediaType" className="text-muted-foreground">
            Type
          </label>
          <select
            id="mediaType"
            className="bg-background rounded border px-2 py-1"
            value={mediaType}
            onChange={(e) => onMediaTypeChange(e.target.value as MediaTypeFilter)}
          >
            <option value="all">All</option>
            <option value="movie">Movies</option>
            <option value="episode">Episodes</option>
          </select>
        </div>
      </header>

      {query.isLoading && <p className="text-muted-foreground">Loading…</p>}
      {query.error && (
        <p className="text-destructive">Failed to load history: {query.error.message}</p>
      )}

      {query.data && query.data.items.length === 0 && (
        <p className="text-muted-foreground">No playback history yet.</p>
      )}

      {query.data && query.data.items.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Player</th>
                <th className="px-3 py-2 text-left font-medium">Decision</th>
                <th className="px-3 py-2 text-right font-medium">Watched</th>
                <th className="px-3 py-2 text-right font-medium">Stopped</th>
                <th className="px-3 py-2 text-left font-medium">Match</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((row) => {
                const watchedPct =
                  row.duration > 0
                    ? Math.min(100, Math.round((row.viewOffset / row.duration) * 100))
                    : 0
                const matched = row.movieId !== null || row.episodeId !== null
                const display =
                  row.mediaType === "episode" && row.grandparentTitle
                    ? `${row.grandparentTitle} — ${row.title}`
                    : row.title
                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2">{row.plexUsername}</td>
                    <td className="px-3 py-2">{display}</td>
                    <td className="px-3 py-2">{row.mediaType}</td>
                    <td className="px-3 py-2">
                      {row.player}
                      <span className="text-muted-foreground"> · {row.platform}</span>
                    </td>
                    <td className="px-3 py-2">{row.transcodeDecision}</td>
                    <td className="px-3 py-2 text-right">{watchedPct}%</td>
                    <td className="text-muted-foreground px-3 py-2 text-right">
                      {new Date(row.stoppedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      {matched ? (
                        <span className="text-xs text-green-500">linked</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">unmonitored</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          disabled={stack.length === 0}
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!query.data?.nextCursor}
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
        >
          Next →
        </button>
      </div>
    </div>
  )
}

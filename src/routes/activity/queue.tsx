import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/activity/queue")({ component: Queue })

type StatusFilter = "all" | "queued" | "downloading" | "importing" | "completed" | "failed"
type MediaTypeFilter = "all" | "movie" | "series" | "unlinked"
type QueueView = "active" | "history"
type DownloadHistoryStatusFilter = "all" | "completed" | "failed" | "removed"
type DownloadHistoryMediaFilter = "all" | "movie" | "series"

function Queue() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<StatusFilter>("all")
  const [mediaType, setMediaType] = useState<MediaTypeFilter>("all")
  const [view, setView] = useState<QueueView>("active")
  const [historyStatus, setHistoryStatus] = useState<DownloadHistoryStatusFilter>("all")
  const [historyMedia, setHistoryMedia] = useState<DownloadHistoryMediaFilter>("all")
  const [deleteFilesById, setDeleteFilesById] = useState<Record<number, boolean>>({})
  const [message, setMessage] = useState<string | null>(null)

  const listKey = trpc.queue.list.queryKey({ status, mediaType })
  const query = useQuery(trpc.queue.list.queryOptions({ status, mediaType }))
  const historyKey = trpc.queue.history.queryKey({
    status: historyStatus,
    mediaKind: historyMedia,
    limit: 100,
  })
  const history = useQuery(
    trpc.queue.history.queryOptions({ status: historyStatus, mediaKind: historyMedia, limit: 100 }),
  )
  const invalidateQueue = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey }),
      queryClient.invalidateQueries({ queryKey: historyKey }),
    ])
  }
  const retry = useMutation(
    trpc.queue.retry.mutationOptions({
      onSuccess: async () => {
        await invalidateQueue()
        setMessage("Queue item retried.")
      },
    }),
  )
  const remove = useMutation(
    trpc.queue.remove.mutationOptions({
      onSuccess: async () => {
        await invalidateQueue()
        setMessage("Queue item removed.")
      },
    }),
  )
  const clearError = useMutation(
    trpc.queue.clearError.mutationOptions({
      onSuccess: async () => {
        await invalidateQueue()
        setMessage("Queue error cleared.")
      },
    }),
  )
  const blocklist = useMutation(
    trpc.queue.blocklist.mutationOptions({
      onSuccess: async () => {
        await invalidateQueue()
        setMessage("Queue item blocklisted.")
      },
    }),
  )
  const pending = retry.isPending || remove.isPending || clearError.isPending || blocklist.isPending
  const mutationError =
    retry.error?.message ??
    remove.error?.message ??
    clearError.error?.message ??
    blocklist.error?.message

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Queue</h1>
          <p className="text-muted-foreground mt-1">
            {view === "active" ? "Current download queue" : "Download history"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="inline-flex overflow-hidden rounded border">
            <button
              type="button"
              className={`px-3 py-1 ${view === "active" ? "bg-muted" : ""}`}
              onClick={() => setView("active")}
            >
              Active
            </button>
            <button
              type="button"
              className={`border-l px-3 py-1 ${view === "history" ? "bg-muted" : ""}`}
              onClick={() => setView("history")}
            >
              History
            </button>
          </div>
          {view === "active" ? (
            <>
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">Status</span>
                <select
                  className="bg-background rounded border px-2 py-1"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as StatusFilter)}
                >
                  <option value="all">All</option>
                  <option value="queued">Queued</option>
                  <option value="downloading">Downloading</option>
                  <option value="importing">Importing</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">Media</span>
                <select
                  className="bg-background rounded border px-2 py-1"
                  value={mediaType}
                  onChange={(event) => setMediaType(event.target.value as MediaTypeFilter)}
                >
                  <option value="all">All</option>
                  <option value="movie">Movies</option>
                  <option value="series">Series</option>
                  <option value="unlinked">Unlinked</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">Status</span>
                <select
                  className="bg-background rounded border px-2 py-1"
                  value={historyStatus}
                  onChange={(event) =>
                    setHistoryStatus(event.target.value as DownloadHistoryStatusFilter)
                  }
                >
                  <option value="all">All</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="removed">Removed</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">Media</span>
                <select
                  className="bg-background rounded border px-2 py-1"
                  value={historyMedia}
                  onChange={(event) =>
                    setHistoryMedia(event.target.value as DownloadHistoryMediaFilter)
                  }
                >
                  <option value="all">All</option>
                  <option value="movie">Movies</option>
                  <option value="series">Series</option>
                </select>
              </label>
            </>
          )}
        </div>
      </header>

      {view === "active" && query.isLoading && (
        <p className="text-muted-foreground">Loading queue...</p>
      )}
      {view === "history" && history.isLoading && (
        <p className="text-muted-foreground">Loading download history...</p>
      )}
      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {mutationError && <p className="text-destructive text-sm">{mutationError}</p>}
      {view === "active" && query.error && (
        <p className="text-destructive">Failed to load queue: {query.error.message}</p>
      )}
      {view === "history" && history.error && (
        <p className="text-destructive">Failed to load download history: {history.error.message}</p>
      )}
      {view === "active" && query.data?.length === 0 && (
        <p className="text-muted-foreground">No active downloads.</p>
      )}
      {view === "history" && history.data?.items.length === 0 && (
        <p className="text-muted-foreground">No download history.</p>
      )}

      {view === "active" && query.data && query.data.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Media</th>
                <th className="px-3 py-2 text-left font-medium">Release</th>
                <th className="px-3 py-2 text-left font-medium">Client</th>
                <th className="px-3 py-2 text-right font-medium">Progress</th>
                <th className="px-3 py-2 text-right font-medium">ETA</th>
                <th className="px-3 py-2 text-right font-medium">Size</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2">
                    <p>{item.media.title}</p>
                    <p className="text-muted-foreground text-xs">{item.media.type}</p>
                  </td>
                  <td className="max-w-80 px-3 py-2">
                    <p className="truncate">{item.title}</p>
                    {item.errorMessage && (
                      <p className="text-destructive truncate text-xs">{item.errorMessage}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">{item.downloadClient.name}</td>
                  <td className="px-3 py-2 text-right">{Math.round(item.progress * 100)}%</td>
                  <td className="px-3 py-2 text-right">{formatEta(item.etaSeconds)}</td>
                  <td className="px-3 py-2 text-right">{formatBytes(item.sizeBytes)}</td>
                  <td className="px-3 py-2">{item.status}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                        disabled={pending || item.status !== "failed"}
                        onClick={() => {
                          setMessage(null)
                          retry.mutate({ id: item.id })
                        }}
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                        disabled={pending || item.errorMessage === null}
                        onClick={() => {
                          setMessage(null)
                          clearError.mutate({ id: item.id })
                        }}
                      >
                        Clear error
                      </button>
                      <label className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                        <input
                          type="checkbox"
                          checked={deleteFilesById[item.id] ?? false}
                          onChange={(event) =>
                            setDeleteFilesById((current) => ({
                              ...current,
                              [item.id]: event.target.checked,
                            }))
                          }
                        />
                        Delete files
                      </label>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                        disabled={pending}
                        onClick={() => {
                          setMessage(null)
                          remove.mutate({
                            id: item.id,
                            deleteFiles: deleteFilesById[item.id] ?? false,
                          })
                        }}
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                        disabled={pending}
                        onClick={() => {
                          setMessage(null)
                          blocklist.mutate({ id: item.id })
                        }}
                      >
                        Blocklist
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "history" && history.data && history.data.items.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Media</th>
                <th className="px-3 py-2 text-left font-medium">Release</th>
                <th className="px-3 py-2 text-left font-medium">Client</th>
                <th className="px-3 py-2 text-right font-medium">Progress</th>
                <th className="px-3 py-2 text-right font-medium">Size</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {history.data.items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2">
                    <p>{item.mediaTitle ?? "Unlinked"}</p>
                    <p className="text-muted-foreground text-xs">{item.mediaKind ?? "unlinked"}</p>
                  </td>
                  <td className="max-w-96 px-3 py-2">
                    <p className="truncate">{item.title}</p>
                    {item.errorMessage && (
                      <p className="text-destructive truncate text-xs">{item.errorMessage}</p>
                    )}
                    {item.outputPath && (
                      <p className="text-muted-foreground truncate text-xs">{item.outputPath}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">{item.downloadClientName ?? "Unknown"}</td>
                  <td className="px-3 py-2 text-right">{Math.round(item.progress * 100)}%</td>
                  <td className="px-3 py-2 text-right">{formatBytes(item.sizeBytes)}</td>
                  <td className="px-3 py-2">{item.status}</td>
                  <td className="px-3 py-2 text-right">
                    {new Date(item.recordedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.data.nextCursor !== null && (
            <p className="text-muted-foreground border-t px-3 py-2 text-xs">
              Showing the latest {history.data.items.length} records.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function formatEta(seconds: number | null) {
  if (seconds === null) return "—"
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.round(minutes / 60)}h`
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

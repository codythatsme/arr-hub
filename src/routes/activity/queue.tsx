import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/activity/queue")({ component: Queue })

type StatusFilter = "all" | "queued" | "downloading" | "importing" | "completed" | "failed"
type MediaTypeFilter = "all" | "movie" | "series" | "unlinked"

function Queue() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<StatusFilter>("all")
  const [mediaType, setMediaType] = useState<MediaTypeFilter>("all")
  const [deleteFilesById, setDeleteFilesById] = useState<Record<number, boolean>>({})
  const [message, setMessage] = useState<string | null>(null)

  const listKey = trpc.queue.list.queryKey({ status, mediaType })
  const query = useQuery(trpc.queue.list.queryOptions({ status, mediaType }))
  const retry = useMutation(
    trpc.queue.retry.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: listKey })
        setMessage("Queue item retried.")
      },
    }),
  )
  const remove = useMutation(
    trpc.queue.remove.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: listKey })
        setMessage("Queue item removed.")
      },
    }),
  )
  const clearError = useMutation(
    trpc.queue.clearError.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: listKey })
        setMessage("Queue error cleared.")
      },
    }),
  )
  const blocklist = useMutation(
    trpc.queue.blocklist.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: listKey })
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
          <p className="text-muted-foreground mt-1">Current download queue</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
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
        </div>
      </header>

      {query.isLoading && <p className="text-muted-foreground">Loading queue...</p>}
      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {mutationError && <p className="text-destructive text-sm">{mutationError}</p>}
      {query.error && (
        <p className="text-destructive">Failed to load queue: {query.error.message}</p>
      )}
      {query.data?.length === 0 && <p className="text-muted-foreground">No active downloads.</p>}

      {query.data && query.data.length > 0 && (
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

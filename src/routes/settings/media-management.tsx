import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FolderPlus, RefreshCw, Save, Trash2 } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/media-management")({
  component: MediaManagement,
})

function MediaManagement() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [namingConvention, setNamingConvention] = useState("{Title} ({Year})")
  const [fileHandling, setFileHandling] = useState("copy")
  const [rootFolderPath, setRootFolderPath] = useState("")
  const [message, setMessage] = useState<string | null>(null)

  const settingsKey = trpc.settings.list.queryKey()
  const rootFoldersKey = trpc.rootFolders.list.queryKey()
  const settings = useQuery(trpc.settings.list.queryOptions())
  const rootFolders = useQuery(trpc.rootFolders.list.queryOptions())

  const setSetting = useMutation(
    trpc.settings.set.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({ queryKey: settingsKey })
        setMessage(`${result.label} saved.`)
      },
    }),
  )
  const addRootFolder = useMutation(
    trpc.rootFolders.add.mutationOptions({
      onSuccess: async (folder) => {
        await queryClient.invalidateQueries({ queryKey: rootFoldersKey })
        setRootFolderPath("")
        setMessage(`Root folder added: ${folder.path}`)
      },
    }),
  )
  const removeRootFolder = useMutation(
    trpc.rootFolders.remove.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: rootFoldersKey })
        setMessage("Root folder removed.")
      },
    }),
  )
  const refreshRootFolder = useMutation(
    trpc.rootFolders.refreshSpace.mutationOptions({
      onSuccess: async (folder) => {
        await queryClient.invalidateQueries({ queryKey: rootFoldersKey })
        setMessage(`Disk space refreshed for ${folder.path}.`)
      },
    }),
  )

  useEffect(() => {
    const rows = settings.data ?? []
    setNamingConvention(
      rows.find((row) => row.key === "media.namingConvention")?.value ?? "{Title} ({Year})",
    )
    setFileHandling(rows.find((row) => row.key === "media.fileHandling")?.value ?? "copy")
  }, [settings.data])

  const pending =
    setSetting.isPending ||
    addRootFolder.isPending ||
    removeRootFolder.isPending ||
    refreshRootFolder.isPending
  const error =
    setSetting.error?.message ??
    addRootFolder.error?.message ??
    removeRootFolder.error?.message ??
    refreshRootFolder.error?.message ??
    settings.error?.message ??
    rootFolders.error?.message

  const saveNaming = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setSetting.mutate({ key: "media.namingConvention", value: namingConvention })
  }
  const saveFileHandling = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setSetting.mutate({ key: "media.fileHandling", value: fileHandling })
  }
  const addFolder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    addRootFolder.mutate({ path: rootFolderPath.trim() })
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Media Management</h1>
        <p className="text-muted-foreground mt-1">
          Configure naming, import file handling, and root folders.
        </p>
      </header>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      <section className="grid gap-6 lg:grid-cols-2">
        <form className="rounded-md border p-4" onSubmit={saveNaming}>
          <h2 className="text-lg font-semibold">Naming</h2>
          <label className="mt-4 block text-sm">
            <span className="font-medium">Naming convention</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2 font-mono"
              value={namingConvention}
              onChange={(event) => setNamingConvention(event.target.value)}
              required
            />
          </label>
          <p className="text-muted-foreground mt-2 text-xs">
            Current placeholders are passed through unchanged until the import pipeline consumes
            them.
          </p>
          <button
            type="submit"
            className="bg-primary text-primary-foreground mt-4 inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
            disabled={pending}
          >
            <Save className="size-4" />
            Save naming
          </button>
        </form>

        <form className="rounded-md border p-4" onSubmit={saveFileHandling}>
          <h2 className="text-lg font-semibold">File Handling</h2>
          <label className="mt-4 block text-sm">
            <span className="font-medium">Completed download action</span>
            <select
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={fileHandling}
              onChange={(event) => setFileHandling(event.target.value)}
            >
              <option value="copy">Copy</option>
              <option value="move">Move</option>
              <option value="hardlink">Hardlink</option>
            </select>
          </label>
          <button
            type="submit"
            className="bg-primary text-primary-foreground mt-4 inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
            disabled={pending}
          >
            <Save className="size-4" />
            Save file handling
          </button>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form className="h-fit rounded-md border p-4" onSubmit={addFolder}>
          <h2 className="text-lg font-semibold">Add Root Folder</h2>
          <label className="mt-4 block text-sm">
            <span className="font-medium">Path</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2 font-mono"
              value={rootFolderPath}
              onChange={(event) => setRootFolderPath(event.target.value)}
              placeholder="/media/movies"
              required
            />
          </label>
          <button
            type="submit"
            className="bg-primary text-primary-foreground mt-4 inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
            disabled={pending || rootFolderPath.trim().length === 0}
          >
            <FolderPlus className="size-4" />
            Add folder
          </button>
        </form>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Root Folders</h2>
          {rootFolders.isLoading && (
            <p className="text-muted-foreground text-sm">Loading root folders...</p>
          )}
          {rootFolders.data?.length === 0 && (
            <p className="text-muted-foreground text-sm">No root folders configured.</p>
          )}
          {rootFolders.data && rootFolders.data.length > 0 && (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Path</th>
                    <th className="px-3 py-2 text-right font-medium">Free</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-right font-medium">Added</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rootFolders.data.map((folder) => (
                    <tr key={folder.id} className="border-t">
                      <td className="max-w-96 px-3 py-2">
                        <p className="truncate font-mono">{folder.path}</p>
                      </td>
                      <td className="px-3 py-2 text-right">{formatBytes(folder.freeSpaceBytes)}</td>
                      <td className="px-3 py-2 text-right">
                        {formatBytes(folder.totalSpaceBytes)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {new Date(folder.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
                            disabled={pending}
                            onClick={() => refreshRootFolder.mutate({ id: folder.id })}
                          >
                            <RefreshCw className="size-3" />
                            Refresh
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${folder.path}`}
                            className="rounded border p-1.5 disabled:opacity-50"
                            disabled={pending}
                            onClick={() => removeRootFolder.mutate({ id: folder.id })}
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
      </section>
    </div>
  )
}

function formatBytes(bytes: number | null) {
  if (bytes === null || bytes <= 0) return "unknown"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

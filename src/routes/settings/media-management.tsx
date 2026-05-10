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
  const [importStabilityDelaySeconds, setImportStabilityDelaySeconds] = useState("60")
  const [rootFolderPath, setRootFolderPath] = useState("")
  const [mappingDownloadClientId, setMappingDownloadClientId] = useState("")
  const [mappingRemotePath, setMappingRemotePath] = useState("")
  const [mappingLocalPath, setMappingLocalPath] = useState("")
  const [message, setMessage] = useState<string | null>(null)

  const settingsKey = trpc.settings.list.queryKey()
  const rootFoldersKey = trpc.rootFolders.list.queryKey()
  const mappingsKey = trpc.mediaManagement.listRemotePathMappings.queryKey()
  const settings = useQuery(trpc.settings.list.queryOptions())
  const rootFolders = useQuery(trpc.rootFolders.list.queryOptions())
  const downloadClients = useQuery(trpc.downloadClients.list.queryOptions())
  const remotePathMappings = useQuery(trpc.mediaManagement.listRemotePathMappings.queryOptions())

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
  const addRemotePathMapping = useMutation(
    trpc.mediaManagement.addRemotePathMapping.mutationOptions({
      onSuccess: async (mapping) => {
        await queryClient.invalidateQueries({ queryKey: mappingsKey })
        setMappingRemotePath("")
        setMappingLocalPath("")
        setMessage(`Remote path mapping added: ${mapping.remotePath}`)
      },
    }),
  )
  const removeRemotePathMapping = useMutation(
    trpc.mediaManagement.removeRemotePathMapping.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: mappingsKey })
        setMessage("Remote path mapping removed.")
      },
    }),
  )
  const scanLibraries = useMutation(
    trpc.mediaManagement.scanLibraries.mutationOptions({
      onSuccess: (result) => {
        setMessage(
          `Scan imported ${result.moviesImported} movie file(s) and ${result.episodesImported} episode file(s).`,
        )
      },
    }),
  )

  useEffect(() => {
    const rows = settings.data ?? []
    setNamingConvention(
      rows.find((row) => row.key === "media.namingConvention")?.value ?? "{Title} ({Year})",
    )
    setFileHandling(rows.find((row) => row.key === "media.fileHandling")?.value ?? "copy")
    setImportStabilityDelaySeconds(
      rows.find((row) => row.key === "media.importStabilityDelaySeconds")?.value ?? "60",
    )
  }, [settings.data])

  const pending =
    setSetting.isPending ||
    addRootFolder.isPending ||
    removeRootFolder.isPending ||
    refreshRootFolder.isPending ||
    addRemotePathMapping.isPending ||
    removeRemotePathMapping.isPending ||
    scanLibraries.isPending
  const error =
    setSetting.error?.message ??
    addRootFolder.error?.message ??
    removeRootFolder.error?.message ??
    refreshRootFolder.error?.message ??
    addRemotePathMapping.error?.message ??
    removeRemotePathMapping.error?.message ??
    scanLibraries.error?.message ??
    settings.error?.message ??
    rootFolders.error?.message ??
    remotePathMappings.error?.message ??
    downloadClients.error?.message

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
  const saveImportDelay = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setSetting.mutate({
      key: "media.importStabilityDelaySeconds",
      value: importStabilityDelaySeconds,
    })
  }
  const addFolder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    addRootFolder.mutate({ path: rootFolderPath.trim() })
  }
  const addMapping = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    addRemotePathMapping.mutate({
      downloadClientId: mappingDownloadClientId.length > 0 ? Number(mappingDownloadClientId) : null,
      remotePath: mappingRemotePath.trim(),
      localPath: mappingLocalPath.trim(),
    })
  }

  const clientName = (id: number | null) =>
    id === null
      ? "Global"
      : ((downloadClients.data ?? []).find((client) => client.id === id)?.name ?? `Client ${id}`)

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

        <form className="rounded-md border p-4" onSubmit={saveImportDelay}>
          <h2 className="text-lg font-semibold">Import Readiness</h2>
          <label className="mt-4 block text-sm">
            <span className="font-medium">Stability delay seconds</span>
            <input
              type="number"
              min="0"
              step="1"
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={importStabilityDelaySeconds}
              onChange={(event) => setImportStabilityDelaySeconds(event.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            className="bg-primary text-primary-foreground mt-4 inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
            disabled={pending}
          >
            <Save className="size-4" />
            Save readiness
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

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form className="h-fit rounded-md border p-4" onSubmit={addMapping}>
          <h2 className="text-lg font-semibold">Remote Path Mapping</h2>
          <label className="mt-4 block text-sm">
            <span className="font-medium">Download client</span>
            <select
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={mappingDownloadClientId}
              onChange={(event) => setMappingDownloadClientId(event.target.value)}
            >
              <option value="">Global</option>
              {(downloadClients.data ?? []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block text-sm">
            <span className="font-medium">Remote path</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2 font-mono"
              value={mappingRemotePath}
              onChange={(event) => setMappingRemotePath(event.target.value)}
              placeholder="/downloads"
              required
            />
          </label>
          <label className="mt-4 block text-sm">
            <span className="font-medium">Local path</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2 font-mono"
              value={mappingLocalPath}
              onChange={(event) => setMappingLocalPath(event.target.value)}
              placeholder="/mnt/downloads"
              required
            />
          </label>
          <button
            type="submit"
            className="bg-primary text-primary-foreground mt-4 inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
            disabled={
              pending ||
              mappingRemotePath.trim().length === 0 ||
              mappingLocalPath.trim().length === 0
            }
          >
            <Save className="size-4" />
            Add mapping
          </button>
        </form>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Import Maintenance</h2>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
              disabled={pending}
              onClick={() => {
                setMessage(null)
                scanLibraries.mutate()
              }}
            >
              <RefreshCw className="size-4" />
              Scan libraries
            </button>
          </div>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Client</th>
                  <th className="px-3 py-2 text-left font-medium">Remote</th>
                  <th className="px-3 py-2 text-left font-medium">Local</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {remotePathMappings.data?.map((mapping) => (
                  <tr key={mapping.id} className="border-t">
                    <td className="px-3 py-2">{clientName(mapping.downloadClientId)}</td>
                    <td className="px-3 py-2 font-mono">{mapping.remotePath}</td>
                    <td className="px-3 py-2 font-mono">{mapping.localPath}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        aria-label={`Delete mapping ${mapping.remotePath}`}
                        className="rounded border p-1.5 disabled:opacity-50"
                        disabled={pending}
                        onClick={() => removeRemotePathMapping.mutate({ id: mapping.id })}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {remotePathMappings.data?.length === 0 && (
                  <tr>
                    <td className="text-muted-foreground px-3 py-4 text-sm" colSpan={4}>
                      No remote path mappings configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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

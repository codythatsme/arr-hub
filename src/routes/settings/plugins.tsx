import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/plugins")({ component: Plugins })

function Plugins() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const listQuery = useQuery(trpc.plugins.list.queryOptions())
  const listKey = trpc.plugins.list.queryKey()
  const [selectedLogPlugin, setSelectedLogPlugin] = useState<string | null>(null)
  const pluginNames = useMemo(
    () => listQuery.data?.map((plugin) => plugin.name) ?? [],
    [listQuery.data],
  )
  const activeLogPlugin =
    selectedLogPlugin && pluginNames.includes(selectedLogPlugin)
      ? selectedLogPlugin
      : (pluginNames[0] ?? null)
  const logsInput = { name: activeLogPlugin ?? "", count: 50 }
  const logsKey = trpc.plugins.logs.queryKey(logsInput)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: listKey })
    if (activeLogPlugin) queryClient.invalidateQueries({ queryKey: logsKey })
  }

  const scan = useMutation(trpc.plugins.scan.mutationOptions({ onSuccess: invalidate }))
  const enable = useMutation(trpc.plugins.enable.mutationOptions({ onSuccess: invalidate }))
  const disable = useMutation(trpc.plugins.disable.mutationOptions({ onSuccess: invalidate }))
  const remove = useMutation(trpc.plugins.remove.mutationOptions({ onSuccess: invalidate }))
  const logsQuery = useQuery(
    trpc.plugins.logs.queryOptions(logsInput, { enabled: activeLogPlugin !== null }),
  )

  const pending = scan.isPending || enable.isPending || disable.isPending || remove.isPending
  const error = scan.error ?? enable.error ?? disable.error ?? remove.error ?? listQuery.error

  return (
    <div className="p-6">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Plugins</h1>
          <p className="text-muted-foreground mt-1">Manage trusted local plugin drop-ins</p>
        </div>
        <button
          type="button"
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          onClick={() => scan.mutate({})}
          disabled={pending}
        >
          {scan.isPending ? "Scanning..." : "Scan"}
        </button>
      </header>

      <p className="text-muted-foreground mb-4 max-w-3xl text-sm">
        V1 plugins are trusted in-process modules loaded from local folders. Drop a folder with a
        plugin.json manifest into the configured plugin directory, scan, then enable it here.
      </p>

      {error && (
        <p className="text-destructive mb-3 text-sm">Plugin action failed: {error.message}</p>
      )}
      {listQuery.isLoading && <p className="text-muted-foreground">Loading plugins...</p>}

      {listQuery.data && listQuery.data.length === 0 && (
        <p className="text-muted-foreground">No plugins discovered yet.</p>
      )}

      {listQuery.data && listQuery.data.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Version</th>
                <th className="px-3 py-2 text-left font-medium">Capabilities</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Contract</th>
                <th className="px-3 py-2 text-left font-medium">Path</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listQuery.data.map((plugin) => (
                <tr key={plugin.name} className="border-t">
                  <td className="px-3 py-2 font-medium">{plugin.name}</td>
                  <td className="px-3 py-2">{plugin.version}</td>
                  <td className="px-3 py-2">
                    {plugin.capabilities.length > 0 ? plugin.capabilities.join(", ") : "none"}
                  </td>
                  <td className="px-3 py-2">
                    <div>{plugin.status}</div>
                    {plugin.errorMessage && (
                      <div className="text-destructive max-w-xs truncate text-xs">
                        {plugin.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{plugin.contractStatus}</td>
                  <td className="text-muted-foreground max-w-sm truncate px-3 py-2">
                    {plugin.path}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {plugin.enabled ? (
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                          onClick={() => disable.mutate({ name: plugin.name })}
                          disabled={pending}
                        >
                          Disable
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                          onClick={() => enable.mutate({ name: plugin.name })}
                          disabled={pending || plugin.capabilities.length === 0}
                        >
                          Enable
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                        onClick={() => remove.mutate({ name: plugin.name })}
                        disabled={pending}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeLogPlugin && (
        <section className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Plugin Logs</h2>
              <p className="text-muted-foreground text-sm">Lifecycle and validation events</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="bg-background rounded border px-2 py-1 text-sm"
                value={activeLogPlugin}
                onChange={(event) => setSelectedLogPlugin(event.target.value)}
              >
                {pluginNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                onClick={() => logsQuery.refetch()}
                disabled={logsQuery.isFetching}
              >
                {logsQuery.isFetching ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          {logsQuery.isLoading && <p className="text-muted-foreground">Loading plugin logs...</p>}
          {logsQuery.error && (
            <p className="text-destructive text-sm">
              Plugin logs failed: {logsQuery.error.message}
            </p>
          )}
          {logsQuery.data?.length === 0 && (
            <p className="text-muted-foreground text-sm">No plugin log entries yet.</p>
          )}
          {logsQuery.data && logsQuery.data.length > 0 && (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Time</th>
                    <th className="px-3 py-2 text-left font-medium">Level</th>
                    <th className="px-3 py-2 text-left font-medium">Message</th>
                    <th className="px-3 py-2 text-left font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logsQuery.data.map((entry) => {
                    const details = formatLogContext(entry.context)
                    return (
                      <tr key={entry.id} className="border-t">
                        <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                          {formatLogTime(entry.timestamp)}
                        </td>
                        <td className="px-3 py-2">{entry.level}</td>
                        <td className="px-3 py-2">{entry.message}</td>
                        <td className="text-muted-foreground max-w-lg truncate px-3 py-2">
                          {details || "-"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function formatLogTime(value: Date | string): string {
  return new Date(value).toLocaleString()
}

function formatLogContext(context: Record<string, unknown> | null): string {
  if (!context) return ""
  const details = Object.fromEntries(
    Object.entries(context).filter(([key]) => key !== "pluginName" && key !== "source"),
  )
  return Object.keys(details).length > 0 ? JSON.stringify(details) : ""
}

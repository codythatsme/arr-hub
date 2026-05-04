import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/plugins")({ component: Plugins })

function Plugins() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const listQuery = useQuery(trpc.plugins.list.queryOptions())
  const listKey = trpc.plugins.list.queryKey()

  const invalidate = () => queryClient.invalidateQueries({ queryKey: listKey })

  const scan = useMutation(trpc.plugins.scan.mutationOptions({ onSuccess: invalidate }))
  const enable = useMutation(trpc.plugins.enable.mutationOptions({ onSuccess: invalidate }))
  const disable = useMutation(trpc.plugins.disable.mutationOptions({ onSuccess: invalidate }))
  const remove = useMutation(trpc.plugins.remove.mutationOptions({ onSuccess: invalidate }))

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
    </div>
  )
}

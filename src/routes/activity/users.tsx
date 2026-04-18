import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/activity/users")({ component: Users })

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0m"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function formatLastSeen(date: Date | null | undefined): string {
  if (!date) return "Never"
  return new Date(date).toLocaleString()
}

function Users() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const serversQuery = useQuery(trpc.mediaServers.list.queryOptions())

  const plexServers = useMemo(
    () => (serversQuery.data ?? []).filter((s) => s.type === "plex"),
    [serversQuery.data],
  )

  const [serverId, setServerId] = useState<number | null>(null)
  const activeId = serverId ?? plexServers[0]?.id ?? null

  const usersQuery = useQuery({
    ...trpc.plexUsers.list.queryOptions(
      { serverId: activeId ?? 0 },
      { enabled: activeId !== null },
    ),
  })

  const listKey = trpc.plexUsers.list.queryKey({ serverId: activeId ?? 0 })

  const syncMutation = useMutation(
    trpc.plexUsers.sync.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
    }),
  )

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const statsQuery = useQuery({
    ...trpc.plexUsers.getStats.queryOptions(
      { serverId: activeId ?? 0, plexUserId: selectedUserId ?? "" },
      { enabled: activeId !== null && selectedUserId !== null },
    ),
  })

  return (
    <div className="p-6">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground mt-1">Plex users and per-user watch stats</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {plexServers.length > 1 && (
            <>
              <label htmlFor="server" className="text-muted-foreground">
                Server
              </label>
              <select
                id="server"
                className="bg-background rounded border px-2 py-1"
                value={activeId ?? ""}
                onChange={(e) => setServerId(Number(e.target.value))}
              >
                {plexServers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            className="rounded border px-3 py-1 disabled:opacity-50"
            onClick={() => activeId !== null && syncMutation.mutate({ serverId: activeId })}
            disabled={activeId === null || syncMutation.isPending}
          >
            {syncMutation.isPending ? "Syncing…" : "Sync from Plex"}
          </button>
        </div>
      </header>

      {serversQuery.isLoading && <p className="text-muted-foreground">Loading servers…</p>}
      {serversQuery.data && plexServers.length === 0 && (
        <p className="text-muted-foreground">
          No Plex servers configured. Add one in Settings → Media Servers.
        </p>
      )}

      {syncMutation.isError && (
        <p className="text-destructive mb-2 text-sm">Sync failed: {syncMutation.error.message}</p>
      )}
      {syncMutation.data && (
        <p className="text-muted-foreground mb-2 text-sm">
          Synced: {syncMutation.data.added} added · {syncMutation.data.updated} updated ·{" "}
          {syncMutation.data.deactivated} deactivated
        </p>
      )}

      {activeId !== null && usersQuery.isLoading && (
        <p className="text-muted-foreground">Loading users…</p>
      )}

      {usersQuery.data && usersQuery.data.length === 0 && (
        <p className="text-muted-foreground">
          No users found. Click &ldquo;Sync from Plex&rdquo; to pull the shared users list.
        </p>
      )}

      {usersQuery.data && usersQuery.data.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
                <th className="px-3 py-2 text-left font-medium">Last Seen</th>
                <th className="px-3 py-2 text-right font-medium">Plays</th>
                <th className="px-3 py-2 text-right font-medium">Watch Time</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {usersQuery.data.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {u.thumb ? (
                        <img src={u.thumb} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <div className="bg-muted text-muted-foreground flex h-7 w-7 items-center justify-center rounded-full text-xs">
                          {u.friendlyName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div>{u.friendlyName}</div>
                        {u.username !== u.friendlyName && (
                          <div className="text-muted-foreground text-xs">@{u.username}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {u.isAdmin ? (
                      <span className="rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-500">
                        admin
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">member</span>
                    )}
                  </td>
                  <td className="text-muted-foreground px-3 py-2">
                    {formatLastSeen(u.lastSeenAt)}
                  </td>
                  <td className="px-3 py-2 text-right">{u.totalPlayCount}</td>
                  <td className="px-3 py-2 text-right">{formatDuration(u.totalWatchTimeSec)}</td>
                  <td className="px-3 py-2">
                    {u.isActive ? (
                      <span className="text-xs text-green-500">active</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">inactive</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs underline"
                      onClick={() =>
                        setSelectedUserId(selectedUserId === u.plexUserId ? null : u.plexUserId)
                      }
                    >
                      {selectedUserId === u.plexUserId ? "Hide" : "Details"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedUserId !== null && statsQuery.data && (
        <div className="mt-4 rounded-md border p-4">
          <h2 className="mb-2 font-semibold">Details</h2>
          <div className="text-muted-foreground grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs uppercase">Plays</div>
              <div className="text-foreground text-lg">{statsQuery.data.totalPlayCount}</div>
            </div>
            <div>
              <div className="text-xs uppercase">Watch time</div>
              <div className="text-foreground text-lg">
                {formatDuration(statsQuery.data.totalWatchTimeSec)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase">Last seen</div>
              <div className="text-foreground text-lg">
                {formatLastSeen(statsQuery.data.lastSeenAt)}
              </div>
            </div>
          </div>
          {statsQuery.data.topMedia.length > 0 && (
            <>
              <h3 className="text-muted-foreground mt-4 mb-2 text-xs uppercase">Top media</h3>
              <ul className="space-y-1 text-sm">
                {statsQuery.data.topMedia.map((m) => (
                  <li key={`${m.mediaType}:${m.title}`} className="flex justify-between">
                    <span>
                      {m.title}{" "}
                      <span className="text-muted-foreground text-xs">({m.mediaType})</span>
                    </span>
                    <span className="text-muted-foreground">
                      {m.playCount} plays · {formatDuration(m.totalWatchedSec)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

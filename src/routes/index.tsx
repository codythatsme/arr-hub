import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Activity, PlayCircle, Wifi } from "lucide-react"
import { useMemo } from "react"

import { ServerHealthBadge } from "@/components/dashboard/server-health-badge"
import { SessionCard } from "@/components/dashboard/session-card"
import { Skeleton } from "@/components/ui/skeleton"
import { useTRPC } from "@/integrations/trpc/react"

export const Route = createFileRoute("/")({ component: Dashboard })

const REFRESH_MS = 5000

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function formatBandwidth(kbps: number): string {
  if (kbps <= 0) return "0 kbps"
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`
  return `${kbps} kbps`
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  readonly icon: React.ReactNode
  readonly label: string
  readonly value: React.ReactNode
  readonly hint?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-4">
      <div className="bg-accent text-accent-foreground rounded-md p-2">{icon}</div>
      <div className="min-w-0">
        <div className="text-muted-foreground text-xs tracking-wide uppercase">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
        {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
      </div>
    </div>
  )
}

function Dashboard() {
  const trpc = useTRPC()
  const todayStart = useMemo(() => startOfToday(), [])

  const sessionsQuery = useQuery(
    trpc.mediaServers.activeSessions.queryOptions(undefined, {
      refetchInterval: REFRESH_MS,
      refetchIntervalInBackground: false,
    }),
  )

  const serversQuery = useQuery(
    trpc.mediaServers.list.queryOptions(undefined, {
      refetchInterval: REFRESH_MS * 6,
    }),
  )

  const todayQuery = useQuery(
    trpc.history.countSince.queryOptions(
      { since: todayStart },
      { refetchInterval: REFRESH_MS * 6 },
    ),
  )

  const sessions = sessionsQuery.data ?? []
  const totalBandwidth = sessions.reduce((acc, s) => acc + (s.bandwidth ?? 0), 0)
  const servers = serversQuery.data ?? []
  const monitoringEnabled = servers.some((s) => s.enabled && s.settings.monitoringEnabled)

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Live activity across your media servers
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<PlayCircle className="h-4 w-4" />}
          label="Active streams"
          value={sessions.length}
        />
        <StatCard
          icon={<Wifi className="h-4 w-4" />}
          label="Total bandwidth"
          value={formatBandwidth(totalBandwidth)}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Plays today"
          value={todayQuery.data ?? 0}
          hint="from session history"
        />
      </section>

      <section>
        <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
          Servers
        </h2>
        {serversQuery.isLoading && <Skeleton className="h-10 w-full max-w-md" />}
        {serversQuery.data && servers.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No media servers configured. Add one in Settings → Media Servers.
          </p>
        )}
        {servers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {servers.map((s) => (
              <ServerHealthBadge
                key={s.id}
                name={s.name}
                status={s.health?.status ?? null}
                version={null}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Active sessions
          </h2>
          {sessionsQuery.isFetching && (
            <span className="text-muted-foreground text-[10px]">refreshing…</span>
          )}
        </div>

        {sessionsQuery.isLoading && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        )}

        {sessionsQuery.error && (
          <p className="text-destructive text-sm">
            Failed to load sessions: {sessionsQuery.error.message}
          </p>
        )}

        {sessionsQuery.data && sessions.length === 0 && (
          <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
            {servers.length === 0
              ? "Connect a media server to start monitoring streams."
              : monitoringEnabled
                ? "No active streams right now."
                : "Live monitoring is disabled. Enable it in your media server settings."}
          </div>
        )}

        {sessions.length > 0 && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {sessions.map((s) => (
              <SessionCard key={`${s.mediaServerId}:${s.sessionKey}`} session={s} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

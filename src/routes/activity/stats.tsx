import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Skeleton } from "@/components/ui/skeleton"
import { useTRPC } from "@/integrations/trpc/react"

export const Route = createFileRoute("/activity/stats")({ component: Stats })

type RangePreset = "7d" | "30d" | "90d" | "custom"
type MediaTypeFilter = "all" | "movie" | "episode"

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function presetRange(preset: RangePreset, customStart: string, customEnd: string) {
  const now = new Date()
  if (preset === "custom") {
    const start = customStart ? startOfDay(new Date(customStart)) : startOfDay(new Date(now))
    const end = customEnd ? endOfDay(new Date(customEnd)) : endOfDay(now)
    return { start, end }
  }
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90
  const start = startOfDay(new Date(now.getTime() - (days - 1) * 86_400_000))
  return { start, end: endOfDay(now) }
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0m"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function formatHour(h: number): string {
  const period = h < 12 ? "am" : "pm"
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display}${period}`
}

const STREAM_COLORS: Record<string, string> = {
  "Direct Play": "#22c55e",
  "Direct Stream": "#3b82f6",
  Transcode: "#f97316",
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
        {title}
      </h2>
      {children}
    </div>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-[260px] items-center justify-center text-sm">
      {children}
    </div>
  )
}

function Stats() {
  const trpc = useTRPC()
  const [preset, setPreset] = useState<RangePreset>("30d")
  const [customStart, setCustomStart] = useState<string>("")
  const [customEnd, setCustomEnd] = useState<string>("")
  const [mediaType, setMediaType] = useState<MediaTypeFilter>("all")
  const [userId, setUserId] = useState<string>("")
  const [serverId, setServerId] = useState<number | null>(null)

  const range = useMemo(
    () => presetRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  )

  const filters = useMemo(
    () => ({
      ...(mediaType === "all" ? {} : { mediaType }),
      ...(userId ? { userId } : {}),
      ...(serverId !== null ? { mediaServerId: serverId } : {}),
    }),
    [mediaType, userId, serverId],
  )

  const serversQuery = useQuery(trpc.mediaServers.list.queryOptions())
  const usersQuery = useQuery({
    ...trpc.plexUsers.list.queryOptions(
      { serverId: serverId ?? 0 },
      { enabled: serverId !== null },
    ),
  })

  const playsByDayQuery = useQuery(trpc.stats.playsByDay.queryOptions({ range, filters }))
  const watchTimeQuery = useQuery(trpc.stats.watchTimeByDay.queryOptions({ range, filters }))
  const topMediaQuery = useQuery(
    trpc.stats.topMedia.queryOptions({
      range,
      mediaType: mediaType === "all" ? undefined : mediaType,
      userId: userId || undefined,
      mediaServerId: serverId ?? undefined,
      limit: 10,
    }),
  )
  const topUsersQuery = useQuery(
    trpc.stats.topUsers.queryOptions({
      range,
      mediaType: mediaType === "all" ? undefined : mediaType,
      mediaServerId: serverId ?? undefined,
      limit: 10,
    }),
  )
  const streamTypesQuery = useQuery(trpc.stats.streamTypes.queryOptions({ range, filters }))
  const hoursQuery = useQuery(trpc.stats.playsByHourOfDay.queryOptions({ range, filters }))

  const playsData = playsByDayQuery.data ?? []
  const watchData = (watchTimeQuery.data ?? []).map((b) => ({
    date: b.date,
    minutes: Math.round(b.seconds / 60),
  }))
  const hoursData = (hoursQuery.data ?? []).map((b) => ({
    hour: b.hour,
    label: formatHour(b.hour),
    plays: b.playCount,
  }))
  const streamData = streamTypesQuery.data
    ? [
        { name: "Direct Play", value: streamTypesQuery.data.directPlay },
        { name: "Direct Stream", value: streamTypesQuery.data.directStream },
        { name: "Transcode", value: streamTypesQuery.data.transcode },
      ].filter((d) => d.value > 0)
    : []

  const topMedia = topMediaQuery.data ?? []
  const topUsers = topUsersQuery.data ?? []

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Stats</h1>
          <p className="text-muted-foreground mt-1 text-sm">Watch analytics across your library</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            aria-label="Range"
            className="bg-background rounded border px-2 py-1"
            value={preset}
            onChange={(e) => setPreset(e.target.value as RangePreset)}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="custom">Custom</option>
          </select>
          {preset === "custom" && (
            <>
              <input
                type="date"
                aria-label="Start date"
                className="bg-background rounded border px-2 py-1"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
              <input
                type="date"
                aria-label="End date"
                className="bg-background rounded border px-2 py-1"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </>
          )}
          <select
            aria-label="Media type"
            className="bg-background rounded border px-2 py-1"
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value as MediaTypeFilter)}
          >
            <option value="all">All media</option>
            <option value="movie">Movies</option>
            <option value="episode">Episodes</option>
          </select>
          <select
            aria-label="Server"
            className="bg-background rounded border px-2 py-1"
            value={serverId ?? ""}
            onChange={(e) => {
              const v = e.target.value
              setServerId(v === "" ? null : Number(v))
              setUserId("")
            }}
          >
            <option value="">All servers</option>
            {(serversQuery.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            aria-label="User"
            className="bg-background rounded border px-2 py-1 disabled:opacity-50"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            disabled={serverId === null}
          >
            <option value="">All users</option>
            {(usersQuery.data ?? []).map((u) => (
              <option key={u.id} value={u.plexUserId}>
                {u.friendlyName}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Daily plays">
          {playsByDayQuery.isLoading && <Skeleton className="h-[260px] w-full" />}
          {playsByDayQuery.data && playsData.length === 0 && <EmptyState>No data</EmptyState>}
          {playsData.length > 0 && (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={playsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" opacity={0.3} />
                <XAxis dataKey="date" stroke="#888" fontSize={11} />
                <YAxis stroke="#888" fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="movies" stackId="a" fill="#3b82f6" name="Movies" />
                <Bar dataKey="episodes" stackId="a" fill="#a855f7" name="Episodes" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Watch time">
          {watchTimeQuery.isLoading && <Skeleton className="h-[260px] w-full" />}
          {watchTimeQuery.data && watchData.length === 0 && <EmptyState>No data</EmptyState>}
          {watchData.length > 0 && (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={watchData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" opacity={0.3} />
                <XAxis dataKey="date" stroke="#888" fontSize={11} />
                <YAxis
                  stroke="#888"
                  fontSize={11}
                  tickFormatter={(v) => formatDuration(Number(v) * 60)}
                />
                <Tooltip formatter={(v) => formatDuration(Number(v) * 60)} />
                <Area
                  type="monotone"
                  dataKey="minutes"
                  stroke="#22c55e"
                  fill="#22c55e"
                  fillOpacity={0.3}
                  name="Watched"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Stream type distribution">
          {streamTypesQuery.isLoading && <Skeleton className="h-[260px] w-full" />}
          {streamTypesQuery.data && streamData.length === 0 && <EmptyState>No data</EmptyState>}
          {streamData.length > 0 && (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={streamData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  label={({ name, value }) => `${name ?? ""}: ${value ?? 0}`}
                >
                  {streamData.map((d) => (
                    <Cell key={d.name} fill={STREAM_COLORS[d.name] ?? "#888"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Peak viewing hours">
          {hoursQuery.isLoading && <Skeleton className="h-[260px] w-full" />}
          {hoursQuery.data && hoursData.every((h) => h.plays === 0) && (
            <EmptyState>No data</EmptyState>
          )}
          {hoursQuery.data && hoursData.some((h) => h.plays > 0) && (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={hoursData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" opacity={0.3} />
                <XAxis dataKey="label" stroke="#888" fontSize={11} interval={1} />
                <YAxis stroke="#888" fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="plays" fill="#f59e0b" name="Plays" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Top media">
          {topMediaQuery.isLoading && <Skeleton className="h-32 w-full" />}
          {topMediaQuery.data && topMedia.length === 0 && <EmptyState>No data</EmptyState>}
          {topMedia.length > 0 && (
            <ol className="space-y-2 text-sm">
              {topMedia.map((m, i) => (
                <li
                  key={`${m.mediaType}:${m.title}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-muted-foreground w-5 tabular-nums">{i + 1}.</span>
                    <span className="truncate">{m.title}</span>
                    <span className="text-muted-foreground text-xs">({m.mediaType})</span>
                  </span>
                  <span className="text-muted-foreground whitespace-nowrap tabular-nums">
                    {m.playCount} plays · {formatDuration(m.totalWatchedSec)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Top users">
          {topUsersQuery.isLoading && <Skeleton className="h-32 w-full" />}
          {topUsersQuery.data && topUsers.length === 0 && <EmptyState>No data</EmptyState>}
          {topUsers.length > 0 && (
            <ol className="space-y-2 text-sm">
              {topUsers.map((u, i) => (
                <li key={u.plexUserId} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-muted-foreground w-5 tabular-nums">{i + 1}.</span>
                    <span className="truncate">{u.plexUsername}</span>
                  </span>
                  <span className="text-muted-foreground whitespace-nowrap tabular-nums">
                    {u.playCount} plays · {formatDuration(u.totalWatchedSec)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </section>
    </div>
  )
}

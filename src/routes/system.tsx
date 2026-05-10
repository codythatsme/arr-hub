import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/system")({ component: System })

function System() {
  const trpc = useTRPC()
  const status = useQuery(trpc.diagnostics.status.queryOptions())
  const health = useQuery(trpc.diagnostics.health.queryOptions())
  const tasks = useQuery(trpc.diagnostics.tasks.queryOptions())
  const logs = useQuery(trpc.diagnostics.logs.queryOptions({ count: 50 }))

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">System</h1>
        <p className="text-muted-foreground mt-1">System status, logs, and diagnostics</p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Version" value={status.data?.version ?? "unknown"} />
        <Metric label="Uptime" value={formatDuration(status.data?.uptimeSeconds ?? 0)} />
        <Metric label="DB size" value={formatBytes(status.data?.database.sizeBytes ?? 0)} />
        <Metric label="Health" value={health.data?.status ?? "loading"} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">System Health</h2>
          </div>
          <div className="divide-y">
            {health.data?.integrations.length === 0 && (
              <p className="text-muted-foreground p-4 text-sm">No integrations configured.</p>
            )}
            {health.data?.integrations.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className="flex items-center justify-between gap-3 p-4 text-sm"
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-muted-foreground">{item.type.replace("_", " ")}</p>
                </div>
                <div className="text-right">
                  <p
                    className={
                      item.status === "unhealthy" ? "text-destructive" : "text-muted-foreground"
                    }
                  >
                    {item.status}
                  </p>
                  {item.message && (
                    <p className="text-muted-foreground max-w-64 truncate">{item.message}</p>
                  )}
                </div>
              </div>
            ))}
            {health.error && <p className="text-destructive p-4 text-sm">{health.error.message}</p>}
          </div>
        </div>

        <div className="rounded-md border">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">Scheduler Tasks</h2>
          </div>
          <div className="grid grid-cols-4 border-b text-center text-sm">
            <Metric label="Running" value={String(tasks.data?.running ?? 0)} compact />
            <Metric label="Pending" value={String(tasks.data?.pending ?? 0)} compact />
            <Metric label="Failed" value={String(tasks.data?.failed ?? 0)} compact />
            <Metric label="Dead" value={String(tasks.data?.dead ?? 0)} compact />
          </div>
          <div className="divide-y">
            {tasks.data?.byType.map((job) => (
              <div key={job.jobType} className="grid grid-cols-[1fr_auto_auto] gap-3 p-3 text-sm">
                <span className="font-medium">{job.jobType}</span>
                <span className="text-muted-foreground">{job.activeCount} active</span>
                <span className={job.enabled ? "text-green-500" : "text-muted-foreground"}>
                  {job.enabled ? "enabled" : "paused"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-md border">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">Structured Logs</h2>
        </div>
        <div className="divide-y">
          {logs.data?.length === 0 && (
            <p className="text-muted-foreground p-4 text-sm">
              No structured log entries captured yet.
            </p>
          )}
          {logs.data?.map((entry) => (
            <div key={entry.id} className="grid gap-2 p-3 text-sm md:grid-cols-[9rem_5rem_1fr]">
              <span className="text-muted-foreground">
                {new Date(entry.timestamp).toLocaleString()}
              </span>
              <span
                className={entry.level === "error" ? "text-destructive" : "text-muted-foreground"}
              >
                {entry.level}
              </span>
              <span>{entry.message}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Metric({
  label,
  value,
  compact = false,
}: {
  label: string
  value: string
  compact?: boolean
}) {
  return (
    <div className={compact ? "p-3" : "rounded-md border p-4"}>
      <p className="text-muted-foreground text-xs uppercase">{label}</p>
      <p className={compact ? "mt-1 font-semibold" : "mt-1 text-xl font-semibold"}>{value}</p>
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

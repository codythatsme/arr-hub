import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { AlertTriangle, DatabaseBackup, Download, RotateCcw } from "lucide-react"
import { useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"
import { getAuthToken } from "#/lib/auth-token"

export const Route = createFileRoute("/system")({ component: System })

interface BackupRow {
  readonly id: string
  readonly filename: string
  readonly createdAt: Date | string
  readonly backupPath: string
  readonly sizeBytes: number
  readonly reason: "scheduled" | "pre_restore"
}

function System() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const status = useQuery(trpc.diagnostics.status.queryOptions())
  const health = useQuery(trpc.diagnostics.health.queryOptions())
  const tasks = useQuery(trpc.diagnostics.tasks.queryOptions())
  const logs = useQuery(trpc.diagnostics.logs.queryOptions({ count: 50 }))
  const backupsKey = trpc.backups.list.queryKey()
  const backups = useQuery(trpc.backups.list.queryOptions())
  const createBackup = useMutation(
    trpc.backups.create.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({ queryKey: backupsKey })
        setMessage(`Backup ${result.filename} created.`)
      },
    }),
  )
  const restoreBackup = useMutation(
    trpc.backups.restore.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries()
        setMessage(`Database restored. Safety backup ${result.safetyBackup.filename} created.`)
      },
    }),
  )
  const downloadBackup = useMutation({
    mutationFn: downloadBackupFile,
    onSuccess: (filename) => setMessage(`Backup ${filename} downloaded.`),
  })

  const pending = createBackup.isPending || restoreBackup.isPending || downloadBackup.isPending
  const error =
    createBackup.error?.message ??
    restoreBackup.error?.message ??
    downloadBackup.error?.message ??
    backups.error?.message ??
    status.error?.message ??
    health.error?.message ??
    tasks.error?.message ??
    logs.error?.message

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">System</h1>
        <p className="text-muted-foreground mt-1">System status, logs, and diagnostics</p>
      </header>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

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
            {health.data?.failures.map((failure) => (
              <div key={`${failure.type}-${failure.message}`} className="flex gap-3 p-4 text-sm">
                <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-medium">{failure.type.replaceAll("_", " ")}</p>
                  <p className="text-muted-foreground">{failure.message}</p>
                </div>
              </div>
            ))}
            {health.data?.integrations.length === 0 && health.data.failures.length === 0 && (
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="font-semibold">Database Backups</h2>
          <button
            type="button"
            className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
            disabled={pending}
            onClick={() => {
              setMessage(null)
              createBackup.mutate()
            }}
          >
            <DatabaseBackup className="size-4" />
            Create backup
          </button>
        </div>
        {backups.isLoading && (
          <p className="text-muted-foreground p-4 text-sm">Loading backups...</p>
        )}
        {backups.data?.length === 0 && (
          <p className="text-muted-foreground p-4 text-sm">No database backups found.</p>
        )}
        {backups.data && backups.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Created</th>
                  <th className="px-3 py-2 text-left font-medium">File</th>
                  <th className="px-3 py-2 text-right font-medium">Size</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.data.map((backup) => (
                  <tr key={backup.id} className="border-t">
                    <td className="px-3 py-2">{formatDate(backup.createdAt)}</td>
                    <td className="px-3 py-2">
                      <p className="font-mono">{backup.filename}</p>
                      <p className="text-muted-foreground max-w-lg truncate text-xs">
                        {backup.backupPath}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right">{formatBytes(backup.sizeBytes)}</td>
                    <td className="px-3 py-2">{labelBackupReason(backup.reason)}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
                          disabled={pending}
                          onClick={() => {
                            setMessage(null)
                            downloadBackup.mutate(backup)
                          }}
                        >
                          <Download className="size-3" />
                          Download
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
                          disabled={pending}
                          onClick={() => {
                            setMessage(null)
                            if (
                              window.confirm(
                                `Restore ${backup.filename}? A safety backup will be created first.`,
                              )
                            ) {
                              restoreBackup.mutate({ id: backup.id })
                            }
                          }}
                        >
                          <RotateCcw className="size-3" />
                          Restore
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

async function downloadBackupFile(backup: BackupRow) {
  const token = getAuthToken()
  if (!token) throw new Error("missing auth token")

  const response = await fetch(`/api/system/backups/${encodeURIComponent(backup.id)}/download`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { readonly error?: string } | null
    throw new Error(body?.error ?? `download failed with HTTP ${response.status}`)
  }

  const blob = await response.blob()
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = href
  anchor.download = backup.filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 0)

  return backup.filename
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

function formatDate(value: Date | string | null) {
  if (value === null) return "never"
  return new Date(value).toLocaleString()
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function labelBackupReason(reason: BackupRow["reason"]) {
  return reason === "pre_restore" ? "Pre-restore" : "Scheduled"
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Pause, Play, RotateCcw, Save } from "lucide-react"
import { type FormEvent, type ReactNode, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/scheduler")({ component: Scheduler })

type JobType =
  | "rss_sync"
  | "search_missing"
  | "search_cutoff"
  | "download_monitor"
  | "tv_rss_sync"
  | "tv_search_cutoff"
  | "tv_search_series"
  | "tv_search_season"
  | "tv_search_episode"

type StatusFilter = "all" | "pending" | "running" | "completed" | "failed" | "dead"
type JobTypeFilter = "all" | JobType

interface ConfigFormState {
  readonly jobType: JobType | null
  readonly intervalMinutes: string
  readonly retryDelaySeconds: string
  readonly maxRetries: string
  readonly backoffMultiplier: string
  readonly enabled: boolean
}

const emptyForm: ConfigFormState = {
  jobType: null,
  intervalMinutes: "20",
  retryDelaySeconds: "60",
  maxRetries: "3",
  backoffMultiplier: "2",
  enabled: true,
}

const jobTypeOptions: ReadonlyArray<JobType> = [
  "rss_sync",
  "search_missing",
  "search_cutoff",
  "download_monitor",
  "tv_rss_sync",
  "tv_search_cutoff",
  "tv_search_series",
  "tv_search_season",
  "tv_search_episode",
]

function Scheduler() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ConfigFormState>(emptyForm)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [jobTypeFilter, setJobTypeFilter] = useState<JobTypeFilter>("all")
  const [message, setMessage] = useState<string | null>(null)

  const statusKey = trpc.scheduler.status.queryKey()
  const configKey = trpc.scheduler.config.queryKey()
  const jobsInput = {
    status: statusFilter === "all" ? undefined : statusFilter,
    jobType: jobTypeFilter === "all" ? undefined : jobTypeFilter,
  }
  const jobsKey = trpc.scheduler.jobs.queryKey(jobsInput)

  const status = useQuery(trpc.scheduler.status.queryOptions())
  const config = useQuery(trpc.scheduler.config.queryOptions())
  const jobs = useQuery(trpc.scheduler.jobs.queryOptions(jobsInput))

  const invalidateScheduler = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: statusKey }),
      queryClient.invalidateQueries({ queryKey: configKey }),
      queryClient.invalidateQueries({ queryKey: jobsKey }),
    ])
  }
  const updateConfig = useMutation(
    trpc.scheduler.updateConfig.mutationOptions({
      onSuccess: async (result) => {
        await invalidateScheduler()
        setForm(emptyForm)
        setMessage(`${labelJob(result.jobType)} config updated.`)
      },
    }),
  )
  const pause = useMutation(
    trpc.scheduler.pause.mutationOptions({
      onSuccess: async () => {
        await invalidateScheduler()
        setMessage("Job type paused.")
      },
    }),
  )
  const resume = useMutation(
    trpc.scheduler.resume.mutationOptions({
      onSuccess: async () => {
        await invalidateScheduler()
        setMessage("Job type resumed.")
      },
    }),
  )
  const pauseAll = useMutation(
    trpc.scheduler.pauseAll.mutationOptions({
      onSuccess: async () => {
        await invalidateScheduler()
        setMessage("All scheduled job types paused.")
      },
    }),
  )
  const resumeAll = useMutation(
    trpc.scheduler.resumeAll.mutationOptions({
      onSuccess: async () => {
        await invalidateScheduler()
        setMessage("All scheduled job types resumed.")
      },
    }),
  )
  const retryJob = useMutation(
    trpc.scheduler.retryJob.mutationOptions({
      onSuccess: async (job) => {
        await invalidateScheduler()
        setMessage(`Job #${job.id} queued for retry.`)
      },
    }),
  )

  const pending =
    updateConfig.isPending ||
    pause.isPending ||
    resume.isPending ||
    pauseAll.isPending ||
    resumeAll.isPending ||
    retryJob.isPending
  const error =
    updateConfig.error?.message ??
    pause.error?.message ??
    resume.error?.message ??
    pauseAll.error?.message ??
    resumeAll.error?.message ??
    retryJob.error?.message ??
    status.error?.message ??
    config.error?.message ??
    jobs.error?.message

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (form.jobType === null) return
    setMessage(null)
    updateConfig.mutate({
      jobType: form.jobType,
      intervalMinutes: Number(form.intervalMinutes),
      retryDelaySeconds: Number(form.retryDelaySeconds),
      maxRetries: Number(form.maxRetries),
      backoffMultiplier: Number(form.backoffMultiplier),
      enabled: form.enabled,
    })
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Scheduler</h1>
          <p className="text-muted-foreground mt-1">
            Configure recurring jobs, pause automation, and retry failed work.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
            disabled={pending}
            onClick={() => pauseAll.mutate()}
          >
            <Pause className="size-4" />
            Pause all
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
            disabled={pending}
            onClick={() => resumeAll.mutate()}
          >
            <Play className="size-4" />
            Resume all
          </button>
        </div>
      </header>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Job Status</h2>
            {status.isLoading && (
              <p className="text-muted-foreground text-sm">Loading scheduler status...</p>
            )}
            {status.data && status.data.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Job</th>
                      <th className="px-3 py-2 text-left font-medium">State</th>
                      <th className="px-3 py-2 text-right font-medium">Interval</th>
                      <th className="px-3 py-2 text-right font-medium">Active</th>
                      <th className="px-3 py-2 text-right font-medium">Last Completed</th>
                      <th className="px-3 py-2 text-right font-medium">Next Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.data.map((item) => (
                      <tr key={item.jobType} className="border-t">
                        <td className="px-3 py-2">{labelJob(item.jobType)}</td>
                        <td className="px-3 py-2">{item.enabled ? "enabled" : "paused"}</td>
                        <td className="px-3 py-2 text-right">{item.intervalMinutes}m</td>
                        <td className="px-3 py-2 text-right">{item.activeCount}</td>
                        <td className="px-3 py-2 text-right">{formatDate(item.lastCompletedAt)}</td>
                        <td className="px-3 py-2 text-right">{formatDate(item.nextRunAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Job Configuration</h2>
            {config.isLoading && (
              <p className="text-muted-foreground text-sm">Loading job configuration...</p>
            )}
            {config.data && config.data.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Job</th>
                      <th className="px-3 py-2 text-right font-medium">Retries</th>
                      <th className="px-3 py-2 text-right font-medium">Backoff</th>
                      <th className="px-3 py-2 text-left font-medium">State</th>
                      <th className="px-3 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.data.map((item) => (
                      <tr key={item.jobType} className="border-t">
                        <td className="px-3 py-2">
                          <p>{labelJob(item.jobType)}</p>
                          <p className="text-muted-foreground text-xs">
                            every {item.intervalMinutes}m · retry delay {item.retryDelaySeconds}s
                          </p>
                        </td>
                        <td className="px-3 py-2 text-right">{item.maxRetries}</td>
                        <td className="px-3 py-2 text-right">{item.backoffMultiplier}</td>
                        <td className="px-3 py-2">{item.enabled ? "enabled" : "paused"}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                              disabled={pending}
                              onClick={() =>
                                setForm({
                                  jobType: item.jobType,
                                  intervalMinutes: String(item.intervalMinutes),
                                  retryDelaySeconds: String(item.retryDelaySeconds),
                                  maxRetries: String(item.maxRetries),
                                  backoffMultiplier: String(item.backoffMultiplier),
                                  enabled: item.enabled,
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                              disabled={pending}
                              onClick={() =>
                                item.enabled
                                  ? pause.mutate({ jobType: item.jobType })
                                  : resume.mutate({ jobType: item.jobType })
                              }
                            >
                              {item.enabled ? "Pause" : "Resume"}
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

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-lg font-semibold">Recent Jobs</h2>
              <div className="flex flex-wrap gap-2 text-sm">
                <select
                  className="bg-background rounded border px-2 py-1"
                  value={jobTypeFilter}
                  onChange={(event) => setJobTypeFilter(event.target.value as JobTypeFilter)}
                >
                  <option value="all">All job types</option>
                  {jobTypeOptions.map((jobType) => (
                    <option key={jobType} value={jobType}>
                      {labelJob(jobType)}
                    </option>
                  ))}
                </select>
                <select
                  className="bg-background rounded border px-2 py-1"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="running">Running</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="dead">Dead</option>
                </select>
              </div>
            </div>
            {jobs.isLoading && <p className="text-muted-foreground text-sm">Loading jobs...</p>}
            {jobs.data?.length === 0 && (
              <p className="text-muted-foreground text-sm">No jobs match the current filters.</p>
            )}
            {jobs.data && jobs.data.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">ID</th>
                      <th className="px-3 py-2 text-left font-medium">Job</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Attempts</th>
                      <th className="px-3 py-2 text-right font-medium">Next Run</th>
                      <th className="px-3 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.data.map((job) => (
                      <tr key={job.id} className="border-t">
                        <td className="px-3 py-2">#{job.id}</td>
                        <td className="px-3 py-2">
                          <p>{labelJob(job.jobType)}</p>
                          {job.errorMessage && (
                            <p className="text-destructive max-w-md truncate text-xs">
                              {job.errorMessage}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2">{job.status}</td>
                        <td className="px-3 py-2 text-right">
                          {job.attempts}/{job.maxAttempts}
                        </td>
                        <td className="px-3 py-2 text-right">{formatDate(job.nextRunAt)}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
                            disabled={
                              pending || job.status === "pending" || job.status === "running"
                            }
                            onClick={() => retryJob.mutate({ id: job.id })}
                          >
                            <RotateCcw className="size-3" />
                            Retry
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <form className="h-fit rounded-md border p-4" onSubmit={onSubmit}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Edit Job Config</h2>
            {form.jobType !== null && (
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                onClick={() => setForm(emptyForm)}
              >
                Cancel
              </button>
            )}
          </div>

          {form.jobType === null ? (
            <p className="text-muted-foreground mt-4 text-sm">
              Select a job configuration to edit.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm font-medium">Job Type</p>
                <p className="mt-1 font-mono text-sm">{form.jobType}</p>
              </div>

              <Field label="Interval minutes">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={form.intervalMinutes}
                  onChange={(event) => setForm({ ...form, intervalMinutes: event.target.value })}
                  type="number"
                  min={0}
                  required
                />
              </Field>

              <Field label="Retry delay seconds">
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={form.retryDelaySeconds}
                  onChange={(event) => setForm({ ...form, retryDelaySeconds: event.target.value })}
                  type="number"
                  min={0}
                  required
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Max retries">
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={form.maxRetries}
                    onChange={(event) => setForm({ ...form, maxRetries: event.target.value })}
                    type="number"
                    min={0}
                    required
                  />
                </Field>
                <Field label="Backoff multiplier">
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={form.backoffMultiplier}
                    onChange={(event) =>
                      setForm({ ...form, backoffMultiplier: event.target.value })
                    }
                    type="number"
                    min={1}
                    step={0.1}
                    required
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                />
                Enabled
              </label>

              <button
                type="submit"
                className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
                disabled={pending}
              >
                <Save className="size-4" />
                Save config
              </button>
            </div>
          )}
        </form>
      </section>
    </div>
  )
}

function Field(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{props.label}</span>
      {props.children}
    </label>
  )
}

function labelJob(jobType: string) {
  return jobType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatDate(value: Date | string | null) {
  if (value === null) return "never"
  return new Date(value).toLocaleString()
}

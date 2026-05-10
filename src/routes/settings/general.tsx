import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Save } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/general")({ component: General })

function General() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [appName, setAppName] = useState("ARR Hub")
  const [updateChannel, setUpdateChannel] = useState("stable")
  const [message, setMessage] = useState<string | null>(null)

  const settingsKey = trpc.settings.list.queryKey()
  const settings = useQuery(trpc.settings.list.queryOptions())
  const status = useQuery(trpc.diagnostics.status.queryOptions())
  const setSetting = useMutation(
    trpc.settings.set.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({ queryKey: settingsKey })
        setMessage(`${result.label} saved.`)
      },
    }),
  )

  useEffect(() => {
    const rows = settings.data ?? []
    setAppName(rows.find((row) => row.key === "app.name")?.value ?? "ARR Hub")
    setUpdateChannel(rows.find((row) => row.key === "app.updateChannel")?.value ?? "stable")
  }, [settings.data])

  const saveAppName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setSetting.mutate({ key: "app.name", value: appName })
  }
  const saveUpdateChannel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setSetting.mutate({ key: "app.updateChannel", value: updateChannel })
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">General</h1>
        <p className="text-muted-foreground mt-1">
          Configure application identity and release channel behavior.
        </p>
      </header>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {setSetting.error && <p className="text-destructive text-sm">{setSetting.error.message}</p>}
      {settings.error && <p className="text-destructive text-sm">{settings.error.message}</p>}

      <section className="grid gap-6 lg:grid-cols-2">
        <form className="rounded-md border p-4" onSubmit={saveAppName}>
          <h2 className="text-lg font-semibold">Application</h2>
          <label className="mt-4 block text-sm">
            <span className="font-medium">App name</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={appName}
              onChange={(event) => setAppName(event.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            className="bg-primary text-primary-foreground mt-4 inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
            disabled={setSetting.isPending}
          >
            <Save className="size-4" />
            Save app name
          </button>
        </form>

        <form className="rounded-md border p-4" onSubmit={saveUpdateChannel}>
          <h2 className="text-lg font-semibold">Updates</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Installed version</dt>
              <dd className="font-mono">{status.data?.version ?? "unknown"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Update source</dt>
              <dd>Deployment managed</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Self-updates</dt>
              <dd>Disabled</dd>
            </div>
          </dl>
          <label className="mt-4 block text-sm">
            <span className="font-medium">Update channel</span>
            <select
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={updateChannel}
              onChange={(event) => setUpdateChannel(event.target.value)}
            >
              <option value="stable">Stable</option>
              <option value="beta">Beta</option>
            </select>
          </label>
          <p className="text-muted-foreground mt-2 text-sm">
            Channel is operator metadata; source and Docker installs are updated outside the app.
          </p>
          <button
            type="submit"
            className="bg-primary text-primary-foreground mt-4 inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
            disabled={setSetting.isPending}
          >
            <Save className="size-4" />
            Save channel
          </button>
        </form>
      </section>

      <section className="rounded-md border">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">Effective General Settings</h2>
        </div>
        <div className="divide-y">
          {settings.isLoading && (
            <p className="text-muted-foreground p-4 text-sm">Loading settings...</p>
          )}
          {settings.data
            ?.filter((item) => item.group === "General")
            .map((item) => (
              <div key={item.key} className="grid gap-2 p-3 text-sm md:grid-cols-[12rem_1fr_1fr]">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-mono">{item.value}</span>
                <span className="text-muted-foreground">
                  {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "default"}
                </span>
              </div>
            ))}
        </div>
      </section>
    </div>
  )
}

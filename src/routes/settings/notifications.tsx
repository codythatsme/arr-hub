import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Bell, BellOff, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/notifications")({
  component: Notifications,
})

const EVENTS = [
  { value: "session_start", label: "Stream start" },
  { value: "session_stop", label: "Stream stop" },
  { value: "media_watched", label: "Watched" },
  { value: "server_down", label: "Server offline" },
  { value: "server_up", label: "Server online" },
  { value: "new_content", label: "New content" },
] as const

type NotificationEvent = (typeof EVENTS)[number]["value"]
type ChannelType = "in_app" | "webhook"

function Notifications() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [name, setName] = useState("In-app alerts")
  const [type, setType] = useState<ChannelType>("in_app")
  const [url, setUrl] = useState("")
  const [events, setEvents] = useState<ReadonlyArray<NotificationEvent>>(
    EVENTS.map((event) => event.value),
  )

  const channelsKey = trpc.notifications.listChannels.queryKey()
  const deliveriesKey = trpc.notifications.listDeliveries.queryKey({ limit: 20 })
  const channels = useQuery(trpc.notifications.listChannels.queryOptions())
  const deliveries = useQuery(trpc.notifications.listDeliveries.queryOptions({ limit: 20 }))
  const create = useMutation(
    trpc.notifications.createChannel.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: channelsKey })
        setName(type === "webhook" ? "Webhook alerts" : "In-app alerts")
        setUrl("")
      },
    }),
  )
  const update = useMutation(
    trpc.notifications.updateChannel.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: channelsKey })
        queryClient.invalidateQueries({ queryKey: deliveriesKey })
      },
    }),
  )
  const remove = useMutation(
    trpc.notifications.deleteChannel.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: channelsKey }),
    }),
  )

  const selectedEvents = useMemo(() => new Set(events), [events])
  const pending = create.isPending || update.isPending || remove.isPending

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-muted-foreground mt-1">
          Deliver stream, content, and server health events.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Channels</h2>
          {channels.isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}
          {channels.error && <p className="text-destructive text-sm">{channels.error.message}</p>}
          {channels.data?.length === 0 && (
            <p className="text-muted-foreground text-sm">No notification channels configured.</p>
          )}
          {channels.data?.map((channel) => (
            <article key={channel.id} className="rounded-md border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    {channel.enabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
                    <h3 className="font-medium">{channel.name}</h3>
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {channel.type === "webhook" ? channel.settings.url : "Stored in ARR Hub"} ·{" "}
                    {channel.events.length} events
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                    disabled={pending}
                    onClick={() =>
                      update.mutate({
                        id: channel.id,
                        data: { enabled: !channel.enabled },
                      })
                    }
                  >
                    {channel.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${channel.name}`}
                    className="rounded border p-1.5 disabled:opacity-50"
                    disabled={pending}
                    onClick={() => remove.mutate({ id: channel.id })}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {channel.events.map((event) => (
                  <span key={event} className="bg-muted rounded px-2 py-1 text-xs">
                    {EVENTS.find((item) => item.value === event)?.label ?? event}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>

        <form
          className="h-fit rounded-md border p-4"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate({
              name,
              type,
              enabled: true,
              events: [...events],
              settings: type === "webhook" ? { url } : {},
            })
          }}
        >
          <h2 className="text-lg font-semibold">Add Channel</h2>
          <div className="mt-4 space-y-4">
            <label className="block text-sm">
              <span className="font-medium">Name</span>
              <input
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium">Type</span>
              <select
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={type}
                onChange={(event) => setType(event.target.value as ChannelType)}
              >
                <option value="in_app">In-app</option>
                <option value="webhook">Webhook</option>
              </select>
            </label>

            {type === "webhook" && (
              <label className="block text-sm">
                <span className="font-medium">Webhook URL</span>
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/arr-hub"
                />
              </label>
            )}

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Events</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {EVENTS.map((event) => (
                  <label key={event.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedEvents.has(event.value)}
                      onChange={(change) => {
                        setEvents((current) =>
                          change.target.checked
                            ? [...current, event.value]
                            : current.filter((value) => value !== event.value),
                        )
                      }}
                    />
                    {event.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {create.error && <p className="text-destructive text-sm">{create.error.message}</p>}
            <button
              type="submit"
              className="bg-primary text-primary-foreground rounded px-3 py-2 text-sm disabled:opacity-50"
              disabled={pending || events.length === 0 || (type === "webhook" && url.length === 0)}
            >
              Add channel
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent Deliveries</h2>
        {deliveries.data?.length === 0 && (
          <p className="text-muted-foreground text-sm">No notification deliveries yet.</p>
        )}
        {deliveries.data && deliveries.data.length > 0 && (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Event</th>
                  <th className="px-3 py-2 text-left font-medium">Message</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Delivered</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.data.map((delivery) => (
                  <tr key={delivery.id} className="border-t">
                    <td className="px-3 py-2">{delivery.event}</td>
                    <td className="px-3 py-2">
                      <p>{delivery.title}</p>
                      <p className="text-muted-foreground text-xs">{delivery.message}</p>
                    </td>
                    <td className="px-3 py-2">{delivery.status}</td>
                    <td className="px-3 py-2 text-right">
                      {new Date(delivery.deliveredAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

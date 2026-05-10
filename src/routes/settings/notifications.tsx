import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Bell, BellOff, Send, Trash2 } from "lucide-react"
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
  { value: "grabbed", label: "Grabbed" },
  { value: "download_failed", label: "Download failed" },
  { value: "imported", label: "Imported" },
  { value: "import_failed", label: "Import failed" },
  { value: "renamed", label: "Renamed" },
  { value: "deleted", label: "Deleted" },
  { value: "blocklisted", label: "Blocklisted" },
  { value: "metadata_refreshed", label: "Metadata refreshed" },
  { value: "indexer_health_changed", label: "Indexer health" },
  { value: "download_client_health_changed", label: "Download client health" },
  { value: "settings_changed", label: "Settings changed" },
] as const

type NotificationEvent = (typeof EVENTS)[number]["value"]
const CHANNEL_TYPES = [
  {
    value: "in_app",
    label: "In-app",
    defaultName: "In-app alerts",
    destination: "Stored in ARR Hub",
    urlLabel: "",
    placeholder: "",
  },
  {
    value: "webhook",
    label: "Webhook",
    defaultName: "Webhook alerts",
    destination: "",
    urlLabel: "Webhook URL",
    placeholder: "https://example.com/arr-hub",
  },
  {
    value: "discord",
    label: "Discord",
    defaultName: "Discord alerts",
    destination: "",
    urlLabel: "Discord webhook URL",
    placeholder: "https://discord.com/api/webhooks/...",
  },
  {
    value: "slack",
    label: "Slack",
    defaultName: "Slack alerts",
    destination: "",
    urlLabel: "Slack webhook URL",
    placeholder: "https://hooks.slack.com/services/...",
  },
  {
    value: "ntfy",
    label: "Ntfy",
    defaultName: "Ntfy alerts",
    destination: "",
    urlLabel: "Ntfy topic URL",
    placeholder: "https://ntfy.sh/arr-hub",
  },
  {
    value: "gotify",
    label: "Gotify",
    defaultName: "Gotify alerts",
    destination: "",
    urlLabel: "Gotify message URL",
    placeholder: "https://gotify.example/message?token=...",
  },
  {
    value: "telegram",
    label: "Telegram",
    defaultName: "Telegram alerts",
    destination: "",
    urlLabel: "Telegram sendMessage URL",
    placeholder: "https://api.telegram.org/bot.../sendMessage?chat_id=...",
  },
  {
    value: "pushover",
    label: "Pushover",
    defaultName: "Pushover alerts",
    destination: "Pushover API",
    urlLabel: "",
    placeholder: "",
  },
  {
    value: "apprise",
    label: "Apprise",
    defaultName: "Apprise alerts",
    destination: "",
    urlLabel: "Apprise notify URL",
    placeholder: "http://apprise.example/notify/team-alerts",
  },
  {
    value: "notifiarr",
    label: "Notifiarr",
    defaultName: "Notifiarr alerts",
    destination: "Notifiarr passthrough",
    urlLabel: "",
    placeholder: "",
  },
  {
    value: "custom_script",
    label: "Custom script",
    defaultName: "Script alerts",
    destination: "",
    urlLabel: "",
    placeholder: "",
  },
  {
    value: "email",
    label: "Email",
    defaultName: "Email alerts",
    destination: "",
    urlLabel: "",
    placeholder: "",
  },
] as const

type ChannelType = (typeof CHANNEL_TYPES)[number]["value"]

function eventLabel(value: string): string {
  return EVENTS.find((event) => event.value === value)?.label ?? value
}

function channelTypeConfig(type: ChannelType) {
  return CHANNEL_TYPES.find((channelType) => channelType.value === type) ?? CHANNEL_TYPES[0]
}

function requiresUrl(type: ChannelType): boolean {
  return channelTypeConfig(type).urlLabel.length > 0
}

function channelDestination(channel: {
  readonly type: ChannelType
  readonly settings: {
    readonly url?: string
    readonly user?: string
    readonly channelId?: string
    readonly scriptPath?: string
    readonly smtpHost?: string
    readonly smtpPort?: number
    readonly fromEmail?: string
    readonly toEmails?: ReadonlyArray<string>
  }
}): string {
  const config = channelTypeConfig(channel.type)
  if (channel.type === "pushover") {
    return channel.settings.user ? "Pushover user key configured" : "Pushover credentials missing"
  }
  if (channel.type === "notifiarr") {
    return channel.settings.channelId
      ? "Notifiarr channel configured"
      : "Notifiarr settings missing"
  }
  if (channel.type === "custom_script") {
    return channel.settings.scriptPath ?? "Script path missing"
  }
  if (channel.type === "email") {
    return channel.settings.toEmails?.length
      ? `SMTP ${channel.settings.smtpHost ?? "host"} to ${channel.settings.toEmails.length} recipients`
      : "SMTP settings missing"
  }
  if (!requiresUrl(channel.type)) return config.destination
  return channel.settings.url ?? `${config.label} URL not configured`
}

function parseScriptArgs(value: string): Array<string> {
  return value
    .split("\n")
    .map((argument) => argument.trim())
    .filter((argument) => argument.length > 0)
}

function parseEmailList(value: string): Array<string> {
  return value
    .split(/[,\n]/)
    .map((email) => email.trim())
    .filter((email) => email.length > 0)
}

function Notifications() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [name, setName] = useState("In-app alerts")
  const [type, setType] = useState<ChannelType>("in_app")
  const [url, setUrl] = useState("")
  const [pushoverToken, setPushoverToken] = useState("")
  const [pushoverUser, setPushoverUser] = useState("")
  const [notifiarrApiKey, setNotifiarrApiKey] = useState("")
  const [notifiarrChannelId, setNotifiarrChannelId] = useState("")
  const [scriptPath, setScriptPath] = useState("")
  const [scriptArgs, setScriptArgs] = useState("")
  const [smtpHost, setSmtpHost] = useState("")
  const [smtpPort, setSmtpPort] = useState(587)
  const [smtpSecurity, setSmtpSecurity] = useState<"none" | "starttls" | "tls">("starttls")
  const [smtpUsername, setSmtpUsername] = useState("")
  const [smtpPassword, setSmtpPassword] = useState("")
  const [fromEmail, setFromEmail] = useState("")
  const [toEmails, setToEmails] = useState("")
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
        setName(channelTypeConfig(type).defaultName)
        setUrl("")
        setPushoverToken("")
        setPushoverUser("")
        setNotifiarrApiKey("")
        setNotifiarrChannelId("")
        setScriptPath("")
        setScriptArgs("")
        setSmtpHost("")
        setSmtpPort(587)
        setSmtpSecurity("starttls")
        setSmtpUsername("")
        setSmtpPassword("")
        setFromEmail("")
        setToEmails("")
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
  const test = useMutation(
    trpc.notifications.testChannel.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveriesKey }),
    }),
  )

  const selectedEvents = useMemo(() => new Set(events), [events])
  const pending = create.isPending || update.isPending || remove.isPending || test.isPending
  const missingSettings =
    (requiresUrl(type) && url.length === 0) ||
    (type === "pushover" && (pushoverToken.length === 0 || pushoverUser.length === 0)) ||
    (type === "notifiarr" && (notifiarrApiKey.length === 0 || notifiarrChannelId.length === 0)) ||
    (type === "custom_script" && scriptPath.length === 0) ||
    (type === "email" &&
      (smtpHost.trim().length === 0 ||
        smtpPort < 1 ||
        fromEmail.trim().length === 0 ||
        parseEmailList(toEmails).length === 0))

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
          {update.error && <p className="text-destructive text-sm">{update.error.message}</p>}
          {test.error && <p className="text-destructive text-sm">{test.error.message}</p>}
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
                    {channelDestination(channel)} · {channel.events.length} events
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
                    disabled={pending}
                    onClick={() =>
                      test.mutate({
                        id: channel.id,
                        event: channel.events[0] ?? "server_up",
                      })
                    }
                  >
                    <Send className="size-3.5" />
                    Test
                  </button>
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
              <fieldset className="mt-3 space-y-2">
                <legend className="text-muted-foreground text-xs font-medium">
                  Event subscriptions
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {EVENTS.map((event) => {
                    const checked = channel.events.includes(event.value)
                    return (
                      <label key={event.value} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={pending || (checked && channel.events.length === 1)}
                          onChange={(change) => {
                            const nextEvents = change.target.checked
                              ? [...new Set([...channel.events, event.value])]
                              : channel.events.filter((value) => value !== event.value)
                            if (nextEvents.length === 0) return
                            update.mutate({
                              id: channel.id,
                              data: { events: nextEvents },
                            })
                          }}
                        />
                        {event.label}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
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
              settings:
                type === "pushover"
                  ? { token: pushoverToken, user: pushoverUser }
                  : type === "notifiarr"
                    ? { token: notifiarrApiKey, channelId: notifiarrChannelId }
                    : type === "custom_script"
                      ? { scriptPath, scriptArgs: parseScriptArgs(scriptArgs) }
                      : type === "email"
                        ? {
                            smtpHost: smtpHost.trim(),
                            smtpPort,
                            smtpSecurity,
                            smtpUsername: smtpUsername.trim() || undefined,
                            smtpPassword: smtpPassword.trim() || undefined,
                            fromEmail: fromEmail.trim(),
                            toEmails: parseEmailList(toEmails),
                          }
                        : requiresUrl(type)
                          ? { url }
                          : {},
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
                {CHANNEL_TYPES.map((channelType) => (
                  <option key={channelType.value} value={channelType.value}>
                    {channelType.label}
                  </option>
                ))}
              </select>
            </label>

            {requiresUrl(type) && (
              <label className="block text-sm">
                <span className="font-medium">{channelTypeConfig(type).urlLabel}</span>
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder={channelTypeConfig(type).placeholder}
                />
              </label>
            )}

            {type === "pushover" && (
              <>
                <label className="block text-sm">
                  <span className="font-medium">Pushover app token</span>
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={pushoverToken}
                    onChange={(event) => setPushoverToken(event.target.value)}
                    placeholder="APP_TOKEN"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Pushover user or group key</span>
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={pushoverUser}
                    onChange={(event) => setPushoverUser(event.target.value)}
                    placeholder="USER_KEY"
                  />
                </label>
              </>
            )}

            {type === "notifiarr" && (
              <>
                <label className="block text-sm">
                  <span className="font-medium">Notifiarr API key</span>
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={notifiarrApiKey}
                    onChange={(event) => setNotifiarrApiKey(event.target.value)}
                    placeholder="API_KEY"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Discord channel ID</span>
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={notifiarrChannelId}
                    onChange={(event) => setNotifiarrChannelId(event.target.value)}
                    placeholder="735481457153277994"
                  />
                </label>
              </>
            )}

            {type === "custom_script" && (
              <>
                <label className="block text-sm">
                  <span className="font-medium">Script path</span>
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={scriptPath}
                    onChange={(event) => setScriptPath(event.target.value)}
                    placeholder="/config/scripts/notify.sh"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Script arguments</span>
                  <textarea
                    className="mt-1 min-h-24 w-full rounded border bg-transparent px-3 py-2"
                    value={scriptArgs}
                    onChange={(event) => setScriptArgs(event.target.value)}
                    placeholder={"--flag\nvalue"}
                  />
                </label>
              </>
            )}

            {type === "email" && (
              <>
                <label className="block text-sm">
                  <span className="font-medium">SMTP host</span>
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={smtpHost}
                    onChange={(event) => setSmtpHost(event.target.value)}
                    placeholder="smtp.example.com"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="font-medium">SMTP port</span>
                    <input
                      type="number"
                      min={1}
                      max={65_535}
                      className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                      value={smtpPort}
                      onChange={(event) => setSmtpPort(Number(event.target.value))}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium">Security</span>
                    <select
                      className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                      value={smtpSecurity}
                      onChange={(event) =>
                        setSmtpSecurity(event.target.value as "none" | "starttls" | "tls")
                      }
                    >
                      <option value="starttls">STARTTLS</option>
                      <option value="tls">TLS</option>
                      <option value="none">None</option>
                    </select>
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="font-medium">Username</span>
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={smtpUsername}
                    onChange={(event) => setSmtpUsername(event.target.value)}
                    placeholder="alerts@example.com"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Password</span>
                  <input
                    type="password"
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={smtpPassword}
                    onChange={(event) => setSmtpPassword(event.target.value)}
                    placeholder="APP_PASSWORD"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">From address</span>
                  <input
                    className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                    value={fromEmail}
                    onChange={(event) => setFromEmail(event.target.value)}
                    placeholder="alerts@example.com"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Recipient addresses</span>
                  <textarea
                    className="mt-1 min-h-24 w-full rounded border bg-transparent px-3 py-2"
                    value={toEmails}
                    onChange={(event) => setToEmails(event.target.value)}
                    placeholder={"ops@example.com\nadmin@example.com"}
                  />
                </label>
              </>
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
              disabled={pending || events.length === 0 || missingSettings}
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
                    <td className="px-3 py-2">{eventLabel(delivery.event)}</td>
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

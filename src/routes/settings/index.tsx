import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Link } from "@tanstack/react-router"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/")({ component: Settings })

const groups = [
  {
    title: "General",
    href: "/settings/general",
    description: "App identity, root folders, update channel",
  },
  {
    title: "Media Management",
    href: "/settings/media-management",
    description: "Naming conventions and file handling",
  },
  {
    title: "Profiles",
    href: "/settings/profiles",
    description: "Quality profiles and custom formats",
  },
  {
    title: "Policies",
    href: "/settings/policies",
    description: "Import lists, release profiles, and delay profiles",
  },
  { title: "Tags", href: "/settings/tags", description: "Shared media and policy labels" },
  { title: "Indexers", href: "/settings/indexers", description: "Indexer connections and health" },
  {
    title: "Download Clients",
    href: "/settings/download-clients",
    description: "Download connections and health",
  },
  {
    title: "Media Servers",
    href: "/settings/media-servers",
    description: "Plex/Jellyfin connections and health",
  },
  {
    title: "Notifications",
    href: "/settings/notifications",
    description: "Notification placeholders",
  },
  {
    title: "Scheduler",
    href: "/settings/scheduler",
    description: "Intervals, retries, pause and resume",
  },
  { title: "Security", href: "/settings/security", description: "Admin password and API keys" },
  { title: "Plugins", href: "/settings/plugins", description: "Local plugin lifecycle and health" },
]

function Settings() {
  const trpc = useTRPC()
  const settings = useQuery(trpc.settings.list.queryOptions())

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Application configuration overview</p>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <Link
            key={group.title}
            to={group.href}
            className="hover:bg-muted/40 rounded-md border p-4 transition-colors"
          >
            <h2 className="font-semibold">{group.title}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{group.description}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-md border">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">Effective Settings</h2>
        </div>
        <div className="divide-y">
          {settings.data?.map((item) => (
            <div key={item.key} className="grid gap-2 p-3 text-sm md:grid-cols-[12rem_1fr_1fr]">
              <span className="text-muted-foreground">{item.group}</span>
              <span>{item.label}</span>
              <span className="font-mono">{item.value}</span>
            </div>
          ))}
          {settings.isLoading && (
            <p className="text-muted-foreground p-4 text-sm">Loading settings...</p>
          )}
        </div>
      </section>
    </div>
  )
}

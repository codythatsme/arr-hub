import type { LucideIcon } from "lucide-react"
import {
  Activity,
  Bell,
  Calendar,
  Clapperboard,
  Download,
  FolderCog,
  Gauge,
  History,
  LayoutDashboard,
  ListOrdered,
  Lock,
  Monitor,
  Puzzle,
  Search,
  Server,
  Settings,
  Tv,
  Users,
} from "lucide-react"

import type { FileRoutesByTo } from "@/routeTree.gen"

type RouteTo = keyof FileRoutesByTo

interface NavItem {
  readonly title: string
  readonly to: RouteTo
  readonly icon: LucideIcon
}

interface NavGroup {
  readonly label: string
  readonly icon: LucideIcon
  readonly basePath: string
  readonly indexTo: RouteTo
  readonly items: readonly NavItem[]
}

const topLevelItems = [
  { title: "Dashboard", to: "/", icon: LayoutDashboard },
  { title: "Movies", to: "/movies", icon: Clapperboard },
  { title: "TV Shows", to: "/tv", icon: Tv },
] as const satisfies readonly NavItem[]

const collapsibleGroups = [
  {
    label: "Activity",
    icon: Activity,
    basePath: "/activity",
    indexTo: "/activity",
    items: [
      { title: "Queue", to: "/activity/queue", icon: ListOrdered },
      { title: "History", to: "/activity/history", icon: History },
      { title: "Users", to: "/activity/users", icon: Users },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    basePath: "/settings",
    indexTo: "/settings",
    items: [
      { title: "General", to: "/settings/general", icon: Gauge },
      { title: "Media Mgmt", to: "/settings/media-management", icon: FolderCog },
      { title: "Profiles", to: "/settings/profiles", icon: ListOrdered },
      { title: "Indexers", to: "/settings/indexers", icon: Search },
      { title: "Download Cl.", to: "/settings/download-clients", icon: Download },
      { title: "Media Servers", to: "/settings/media-servers", icon: Monitor },
      { title: "Notifications", to: "/settings/notifications", icon: Bell },
      { title: "Scheduler", to: "/settings/scheduler", icon: Calendar },
      { title: "Security", to: "/settings/security", icon: Lock },
      { title: "Plugins", to: "/settings/plugins", icon: Puzzle },
    ],
  },
] as const satisfies readonly NavGroup[]

const bottomItems = [
  { title: "System", to: "/system", icon: Server },
] as const satisfies readonly NavItem[]

export { topLevelItems, collapsibleGroups, bottomItems }
export type { NavItem, NavGroup }

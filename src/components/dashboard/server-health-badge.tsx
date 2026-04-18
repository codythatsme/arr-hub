import type { MediaServerHealthStatus } from "#/effect/domain/mediaServer"
import { cn } from "@/lib/utils"

const DOT: Record<MediaServerHealthStatus, string> = {
  healthy: "bg-green-500",
  unhealthy: "bg-red-500",
  unknown: "bg-zinc-400",
}

const LABEL: Record<MediaServerHealthStatus, string> = {
  healthy: "Online",
  unhealthy: "Offline",
  unknown: "Unknown",
}

interface ServerHealthBadgeProps {
  readonly status: MediaServerHealthStatus | null
  readonly name: string
  readonly version?: string | null
}

export function ServerHealthBadge({ status, name, version }: ServerHealthBadgeProps) {
  const s = status ?? "unknown"
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
      <span className={cn("inline-block h-2 w-2 rounded-full", DOT[s])} aria-label={LABEL[s]} />
      <span className="font-medium">{name}</span>
      {version && <span className="text-muted-foreground text-xs">v{version}</span>}
      <span className="text-muted-foreground text-xs">{LABEL[s]}</span>
    </div>
  )
}

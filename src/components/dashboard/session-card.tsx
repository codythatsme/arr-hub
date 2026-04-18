import { Pause, Play, Loader2 } from "lucide-react"

import type { MediaServerSession, SessionState } from "#/effect/domain/mediaServer"
import { cn } from "@/lib/utils"

import { ProgressRing } from "./progress-ring"
import { TranscodeBadge } from "./transcode-badge"

const STATE_ICON: Record<SessionState, React.ReactNode> = {
  playing: <Play className="h-3 w-3" aria-label="playing" />,
  paused: <Pause className="h-3 w-3" aria-label="paused" />,
  buffering: <Loader2 className="h-3 w-3 animate-spin" aria-label="buffering" />,
}

const STATE_TONE: Record<SessionState, string> = {
  playing: "bg-green-500/15 text-green-500",
  paused: "bg-zinc-500/20 text-zinc-300",
  buffering: "bg-blue-500/15 text-blue-400",
}

function formatBandwidth(kbps: number | null): string | null {
  if (kbps === null || kbps <= 0) return null
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`
  return `${kbps} kbps`
}

const pad2 = (n: number) => String(n).padStart(2, "0")

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`
}

function displayTitle(s: MediaServerSession): string {
  if (s.mediaType === "episode" && s.grandparentTitle) {
    return s.grandparentTitle
  }
  return s.title
}

function displaySubtitle(s: MediaServerSession): string | null {
  if (s.mediaType === "episode") {
    return s.title
  }
  return s.year ? String(s.year) : null
}

function avatarLetter(username: string): string {
  return (username.trim()[0] ?? "?").toUpperCase()
}

export function SessionCard({ session }: { readonly session: MediaServerSession }) {
  const subtitle = displaySubtitle(session)
  const bandwidth = formatBandwidth(session.bandwidth)

  return (
    <div className="flex gap-4 rounded-lg border p-4">
      <ProgressRing value={session.progressPercent} size={64} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{displayTitle(session)}</div>
            {subtitle && <div className="text-muted-foreground truncate text-xs">{subtitle}</div>}
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
              STATE_TONE[session.state],
            )}
          >
            {STATE_ICON[session.state]}
            {session.state}
          </span>
        </div>

        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="bg-muted text-foreground flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium">
              {avatarLetter(session.username)}
            </div>
            <span className="text-foreground">{session.username || "anonymous"}</span>
          </div>
          <span>·</span>
          <span>
            {session.player}
            {session.platform && ` (${session.platform})`}
          </span>
          {session.videoResolution && (
            <>
              <span>·</span>
              <span>{session.videoResolution}p</span>
            </>
          )}
          {bandwidth && (
            <>
              <span>·</span>
              <span>{bandwidth}</span>
            </>
          )}
          <span>·</span>
          <span>{session.isLocal ? "LAN" : "WAN"}</span>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <TranscodeBadge decision={session.transcodeDecision} />
          <div className="text-muted-foreground font-mono text-[11px]">
            {formatTime(session.viewOffset)} / {formatTime(session.duration)}
          </div>
        </div>
      </div>
    </div>
  )
}

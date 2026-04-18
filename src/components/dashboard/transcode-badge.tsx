import type { TranscodeDecision } from "#/effect/domain/mediaServer"
import { cn } from "@/lib/utils"

const LABEL: Record<TranscodeDecision, string> = {
  direct_play: "Direct Play",
  direct_stream: "Direct Stream",
  transcode: "Transcode",
}

const TONE: Record<TranscodeDecision, string> = {
  direct_play: "bg-green-500/15 text-green-500",
  direct_stream: "bg-yellow-500/15 text-yellow-500",
  transcode: "bg-orange-500/15 text-orange-500",
}

export function TranscodeBadge({ decision }: { readonly decision: TranscodeDecision }) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", TONE[decision])}>
      {LABEL[decision]}
    </span>
  )
}

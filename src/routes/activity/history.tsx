import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import type { DomainHistoryRow } from "#/effect/services/OperationalHistoryService"
import type { SessionHistoryRow } from "#/effect/services/SessionHistoryService"
import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/activity/history")({ component: History })

const OPERATIONAL_EVENT_TYPES = [
  "grabbed",
  "download_failed",
  "imported",
  "import_failed",
  "renamed",
  "deleted",
  "blocklisted",
  "metadata_refreshed",
  "indexer_health_changed",
  "download_client_health_changed",
  "notification_delivery",
  "settings_changed",
] as const

const OPERATIONAL_MEDIA_KINDS = ["movie", "series", "season", "episode"] as const

type HistoryTab = "operational" | "playback"
type MediaTypeFilter = "all" | "movie" | "episode"
type OperationalEventFilter = "all" | (typeof OPERATIONAL_EVENT_TYPES)[number]
type OperationalMediaFilter = "all" | (typeof OPERATIONAL_MEDIA_KINDS)[number]
type HistoryPage<T> = {
  readonly items: ReadonlyArray<T>
  readonly nextCursor: number | null
}
type HistoryQuery<T> = {
  readonly data?: HistoryPage<T>
  readonly isLoading: boolean
  readonly error: { readonly message: string } | null
}

function History() {
  const trpc = useTRPC()
  const [tab, setTab] = useState<HistoryTab>("operational")
  const [mediaType, setMediaType] = useState<MediaTypeFilter>("all")
  const [eventType, setEventType] = useState<OperationalEventFilter>("all")
  const [mediaKind, setMediaKind] = useState<OperationalMediaFilter>("all")
  const [playbackCursor, setPlaybackCursor] = useState<number | null>(null)
  const [playbackStack, setPlaybackStack] = useState<ReadonlyArray<number | null>>([])
  const [operationalCursor, setOperationalCursor] = useState<number | null>(null)
  const [operationalStack, setOperationalStack] = useState<ReadonlyArray<number | null>>([])

  const playbackQuery = useQuery(
    trpc.history.list.queryOptions(
      {
        cursor: playbackCursor,
        limit: 50,
        filters: mediaType === "all" ? undefined : { mediaType },
      },
      { enabled: tab === "playback" },
    ),
  )

  const operationalFilters =
    eventType === "all" && mediaKind === "all"
      ? undefined
      : {
          eventType: eventType === "all" ? undefined : eventType,
          mediaKind: mediaKind === "all" ? undefined : mediaKind,
        }
  const operationalQuery = useQuery(
    trpc.history.listOperational.queryOptions(
      {
        cursor: operationalCursor,
        limit: 50,
        filters: operationalFilters,
      },
      { enabled: tab === "operational" },
    ),
  )

  const onTabChange = (next: HistoryTab) => {
    setTab(next)
  }

  const onMediaTypeChange = (next: MediaTypeFilter) => {
    setMediaType(next)
    setPlaybackCursor(null)
    setPlaybackStack([])
  }

  const onEventTypeChange = (next: OperationalEventFilter) => {
    setEventType(next)
    setOperationalCursor(null)
    setOperationalStack([])
  }

  const onMediaKindChange = (next: OperationalMediaFilter) => {
    setMediaKind(next)
    setOperationalCursor(null)
    setOperationalStack([])
  }

  const onOperationalNext = () => {
    if (
      operationalQuery.data?.nextCursor === null ||
      operationalQuery.data?.nextCursor === undefined
    )
      return
    setOperationalStack((s) => [...s, operationalCursor])
    setOperationalCursor(operationalQuery.data.nextCursor)
  }

  const onOperationalPrev = () => {
    if (operationalStack.length === 0) return
    const prev = operationalStack[operationalStack.length - 1] ?? null
    setOperationalStack((s) => s.slice(0, -1))
    setOperationalCursor(prev)
  }

  const onPlaybackNext = () => {
    if (playbackQuery.data?.nextCursor === null || playbackQuery.data?.nextCursor === undefined)
      return
    setPlaybackStack((s) => [...s, playbackCursor])
    setPlaybackCursor(playbackQuery.data.nextCursor)
  }

  const onPlaybackPrev = () => {
    if (playbackStack.length === 0) return
    const prev = playbackStack[playbackStack.length - 1] ?? null
    setPlaybackStack((s) => s.slice(0, -1))
    setPlaybackCursor(prev)
  }

  return (
    <div className="p-6">
      <header className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">History</h1>
          <p className="text-muted-foreground mt-1">Operational and playback activity</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            className={
              tab === "operational"
                ? "bg-primary text-primary-foreground rounded border px-3 py-1"
                : "rounded border px-3 py-1"
            }
            onClick={() => onTabChange("operational")}
          >
            Operational
          </button>
          <button
            type="button"
            className={
              tab === "playback"
                ? "bg-primary text-primary-foreground rounded border px-3 py-1"
                : "rounded border px-3 py-1"
            }
            onClick={() => onTabChange("playback")}
          >
            Playback
          </button>
        </div>
      </header>

      {tab === "operational" ? (
        <OperationalHistory
          query={operationalQuery}
          eventType={eventType}
          mediaKind={mediaKind}
          onEventTypeChange={onEventTypeChange}
          onMediaKindChange={onMediaKindChange}
          onNext={onOperationalNext}
          onPrev={onOperationalPrev}
          canPrev={operationalStack.length > 0}
        />
      ) : (
        <PlaybackHistory
          query={playbackQuery}
          mediaType={mediaType}
          onMediaTypeChange={onMediaTypeChange}
          onNext={onPlaybackNext}
          onPrev={onPlaybackPrev}
          canPrev={playbackStack.length > 0}
        />
      )}
    </div>
  )
}

function OperationalHistory(props: {
  readonly query: HistoryQuery<DomainHistoryRow>
  readonly eventType: OperationalEventFilter
  readonly mediaKind: OperationalMediaFilter
  readonly onEventTypeChange: (next: OperationalEventFilter) => void
  readonly onMediaKindChange: (next: OperationalMediaFilter) => void
  readonly onNext: () => void
  readonly onPrev: () => void
  readonly canPrev: boolean
}) {
  const rows = props.query.data?.items ?? []
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <label className="text-muted-foreground flex items-center gap-2">
          Event
          <select
            className="bg-background rounded border px-2 py-1"
            value={props.eventType}
            onChange={(e) => props.onEventTypeChange(e.target.value as OperationalEventFilter)}
          >
            <option value="all">All</option>
            {OPERATIONAL_EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {eventLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-muted-foreground flex items-center gap-2">
          Media
          <select
            className="bg-background rounded border px-2 py-1"
            value={props.mediaKind}
            onChange={(e) => props.onMediaKindChange(e.target.value as OperationalMediaFilter)}
          >
            <option value="all">All</option>
            {OPERATIONAL_MEDIA_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {eventLabel(kind)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {props.query.isLoading && <p className="text-muted-foreground">Loading...</p>}
      {props.query.error && (
        <p className="text-destructive">
          Failed to load operational history: {props.query.error.message}
        </p>
      )}
      {props.query.data && rows.length === 0 && (
        <p className="text-muted-foreground">No operational history yet.</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">Event</th>
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium">Media</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-left font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{eventLabel(row.eventType)}</td>
                  <td className="px-3 py-2">{row.title}</td>
                  <td className="px-3 py-2">{mediaLabel(row)}</td>
                  <td className="px-3 py-2">{sourceLabel(row)}</td>
                  <td className="px-3 py-2">{row.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager
        canPrev={props.canPrev}
        canNext={Boolean(props.query.data?.nextCursor)}
        onPrev={props.onPrev}
        onNext={props.onNext}
      />
    </>
  )
}

function PlaybackHistory(props: {
  readonly query: HistoryQuery<SessionHistoryRow>
  readonly mediaType: MediaTypeFilter
  readonly onMediaTypeChange: (next: MediaTypeFilter) => void
  readonly onNext: () => void
  readonly onPrev: () => void
  readonly canPrev: boolean
}) {
  const rows = props.query.data?.items ?? []
  return (
    <>
      <div className="mb-4 flex items-center gap-2 text-sm">
        <label htmlFor="mediaType" className="text-muted-foreground">
          Type
        </label>
        <select
          id="mediaType"
          className="bg-background rounded border px-2 py-1"
          value={props.mediaType}
          onChange={(e) => props.onMediaTypeChange(e.target.value as MediaTypeFilter)}
        >
          <option value="all">All</option>
          <option value="movie">Movies</option>
          <option value="episode">Episodes</option>
        </select>
      </div>

      {props.query.isLoading && <p className="text-muted-foreground">Loading...</p>}
      {props.query.error && (
        <p className="text-destructive">
          Failed to load playback history: {props.query.error.message}
        </p>
      )}
      {props.query.data && rows.length === 0 && (
        <p className="text-muted-foreground">No playback history yet.</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Player</th>
                <th className="px-3 py-2 text-left font-medium">Decision</th>
                <th className="px-3 py-2 text-right font-medium">Watched</th>
                <th className="px-3 py-2 text-right font-medium">Stopped</th>
                <th className="px-3 py-2 text-left font-medium">Match</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const watchedPct =
                  row.duration > 0
                    ? Math.min(100, Math.round((row.viewOffset / row.duration) * 100))
                    : 0
                const matched = row.movieId !== null || row.episodeId !== null
                const display =
                  row.mediaType === "episode" && row.grandparentTitle
                    ? `${row.grandparentTitle} - ${row.title}`
                    : row.title
                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2">{row.plexUsername}</td>
                    <td className="px-3 py-2">{display}</td>
                    <td className="px-3 py-2">{row.mediaType}</td>
                    <td className="px-3 py-2">
                      {row.player}
                      <span className="text-muted-foreground"> / {row.platform}</span>
                    </td>
                    <td className="px-3 py-2">{row.transcodeDecision}</td>
                    <td className="px-3 py-2 text-right">{watchedPct}%</td>
                    <td className="text-muted-foreground px-3 py-2 text-right">
                      {new Date(row.stoppedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      {matched ? (
                        <span className="text-xs text-green-500">linked</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">unmonitored</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager
        canPrev={props.canPrev}
        canNext={Boolean(props.query.data?.nextCursor)}
        onPrev={props.onPrev}
        onNext={props.onNext}
      />
    </>
  )
}

function Pager(props: {
  readonly canPrev: boolean
  readonly canNext: boolean
  readonly onPrev: () => void
  readonly onNext: () => void
}) {
  return (
    <div className="mt-4 flex items-center justify-between">
      <button
        type="button"
        onClick={props.onPrev}
        disabled={!props.canPrev}
        className="rounded border px-3 py-1 text-sm disabled:opacity-50"
      >
        Previous
      </button>
      <button
        type="button"
        onClick={props.onNext}
        disabled={!props.canNext}
        className="rounded border px-3 py-1 text-sm disabled:opacity-50"
      >
        Next
      </button>
    </div>
  )
}

function eventLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ")
}

function mediaLabel(row: {
  readonly mediaKind: string | null
  readonly movieId: number | null
  readonly seriesId: number | null
  readonly seasonId: number | null
  readonly episodeId: number | null
}) {
  if (row.mediaKind === null) return "-"
  const id = row.episodeId ?? row.seasonId ?? row.seriesId ?? row.movieId
  return id === null ? eventLabel(row.mediaKind) : `${eventLabel(row.mediaKind)} #${id}`
}

function sourceLabel(row: {
  readonly indexerName: string | null
  readonly downloadClientName: string | null
  readonly downloadExternalId: string | null
}) {
  const source = row.indexerName ?? row.downloadClientName
  if (!source && !row.downloadExternalId) return "-"
  return [source, row.downloadExternalId].filter(Boolean).join(" / ")
}

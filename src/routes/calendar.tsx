import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react"
import { type ChangeEvent, type ReactNode, useCallback, useMemo, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/calendar")({ component: CalendarPage })

const DAY_MS = 86_400_000
const monthInputPattern = /^\d{4}-\d{2}$/
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

type CalendarEpisode = {
  readonly episode: {
    readonly id: number
    readonly title: string
    readonly episodeNumber: number
    readonly airDate: Date | null
    readonly hasFile: boolean
  }
  readonly season: {
    readonly seasonNumber: number
  }
  readonly series: {
    readonly id: number
    readonly title: string
    readonly network: string | null
  }
}

function CalendarPage() {
  const trpc = useTRPC()
  const [monthValue, setMonthValue] = useState(() => toMonthInputValue(new Date()))
  const monthStart = useMemo(() => parseMonthInput(monthValue), [monthValue])
  const gridStart = useMemo(() => startOfWeek(monthStart), [monthStart])
  const gridEnd = useMemo(() => endOfDay(endOfWeek(endOfMonth(monthStart))), [monthStart])
  const days = useMemo(() => enumerateDays(gridStart, gridEnd), [gridStart, gridEnd])
  const todayKey = dateKey(new Date())

  const query = useQuery(
    trpc.series.calendar.queryOptions({
      start: gridStart,
      end: gridEnd,
    }),
  )

  const rows = useMemo(() => sortEpisodes(query.data ?? []), [query.data])
  const rowsByDate = useMemo(() => groupEpisodesByDate(rows), [rows])
  const uniqueSeries = new Set(rows.map((row) => row.series.id)).size
  const availableCount = rows.filter((row) => row.episode.hasFile).length
  const missingCount = rows.length - availableCount
  const monthLabel = formatMonth(monthStart)

  const showPreviousMonth = useCallback(() => {
    setMonthValue((current) => toMonthInputValue(addMonths(parseMonthInput(current), -1)))
  }, [])
  const showNextMonth = useCallback(() => {
    setMonthValue((current) => toMonthInputValue(addMonths(parseMonthInput(current), 1)))
  }, [])
  const showToday = useCallback(() => {
    setMonthValue(toMonthInputValue(new Date()))
  }, [])
  const handleMonthChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value
    if (monthInputPattern.test(next)) setMonthValue(next)
  }, [])

  const error = query.error?.message

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-muted-foreground mt-1">
            Monitored TV air dates from episode metadata.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded border px-3 py-2 disabled:opacity-50"
            onClick={showPreviousMonth}
            aria-label="Previous month"
            title="Previous month"
          >
            <ChevronLeft className="size-4" />
          </button>
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Month</span>
            <input
              type="month"
              className="bg-background rounded border px-3 py-2"
              value={monthValue}
              onChange={handleMonthChange}
            />
          </label>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded border px-3 py-2 disabled:opacity-50"
            onClick={showNextMonth}
            aria-label="Next month"
            title="Next month"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded border px-3 py-2"
            onClick={showToday}
          >
            <RotateCcw className="size-4" />
            Today
          </button>
        </div>
      </header>

      {query.isLoading && <p className="text-muted-foreground text-sm">Loading calendar...</p>}
      {error && <p className="text-destructive text-sm">Failed to load calendar: {error}</p>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Episodes" value={rows.length} />
        <Metric label="Available" value={availableCount} />
        <Metric label="Missing" value={missingCount} />
        <Metric label="Series" value={uniqueSeries} />
      </section>

      <section className="overflow-hidden rounded-md border">
        <div className="bg-muted/50 flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold">{monthLabel}</h2>
          <p className="text-muted-foreground text-sm">{rows.length} scheduled</p>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-7 border-b">
              {weekdayLabels.map((day) => (
                <div key={day} className="text-muted-foreground px-3 py-2 text-xs font-medium">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = dateKey(day)
                const items = rowsByDate.get(key) ?? []
                const inSelectedMonth = day.getUTCMonth() === monthStart.getUTCMonth()
                return (
                  <div
                    key={key}
                    className={[
                      "min-h-36 border-r border-b p-2 last:border-r-0",
                      inSelectedMonth ? "bg-background" : "bg-muted/20 text-muted-foreground",
                    ].join(" ")}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span
                        className={[
                          "inline-flex size-7 items-center justify-center rounded-full text-sm font-medium",
                          key === todayKey ? "bg-primary text-primary-foreground" : "",
                        ].join(" ")}
                      >
                        {day.getUTCDate()}
                      </span>
                      {items.length > 0 && (
                        <span className="text-muted-foreground text-xs">{items.length}</span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {items.slice(0, 4).map((item) => (
                        <EpisodePill key={item.episode.id} item={item} />
                      ))}
                      {items.length > 4 && (
                        <p className="text-muted-foreground px-1 text-xs">
                          +{items.length - 4} more
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Agenda</h2>
          <p className="text-muted-foreground text-sm">{formatRange(gridStart, gridEnd)}</p>
        </div>
        {rows.length === 0 && !query.isLoading && (
          <p className="text-muted-foreground text-sm">No monitored episodes in this date range.</p>
        )}
        {rows.length > 0 && (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Series</th>
                  <th className="px-3 py-2 text-left font-medium">Episode</th>
                  <th className="px-3 py-2 text-left font-medium">Network</th>
                  <th className="px-3 py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.episode.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {item.episode.airDate ? formatDate(item.episode.airDate) : "unknown"}
                    </td>
                    <td className="px-3 py-2">
                      <SeriesLink seriesId={item.series.id} className="font-medium hover:underline">
                        {item.series.title}
                      </SeriesLink>
                    </td>
                    <td className="px-3 py-2">
                      <p>{item.episode.title}</p>
                      <p className="text-muted-foreground text-xs">{episodeCode(item)}</p>
                    </td>
                    <td className="px-3 py-2">{item.series.network ?? "unknown"}</td>
                    <td className="px-3 py-2 text-right">
                      {item.episode.hasFile ? "available" : "missing"}
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

function Metric({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded-md border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function EpisodePill({ item }: { readonly item: CalendarEpisode }) {
  return (
    <SeriesLink
      seriesId={item.series.id}
      className={[
        "block rounded border-l-2 bg-muted/35 px-2 py-1 text-xs hover:bg-muted",
        item.episode.hasFile ? "border-l-emerald-500" : "border-l-amber-500",
      ].join(" ")}
    >
      <span className="block truncate font-medium">{item.series.title}</span>
      <span className="text-muted-foreground block truncate">
        {episodeCode(item)} · {item.episode.title}
      </span>
    </SeriesLink>
  )
}

function SeriesLink({
  seriesId,
  className,
  children,
}: {
  readonly seriesId: number
  readonly className?: string
  readonly children: ReactNode
}) {
  const params = useMemo(() => ({ id: String(seriesId) }), [seriesId])
  return (
    <Link to="/tv/$id" params={params} className={className}>
      {children}
    </Link>
  )
}

function sortEpisodes(rows: ReadonlyArray<CalendarEpisode>): ReadonlyArray<CalendarEpisode> {
  return rows.toSorted((a, b) => {
    const aTime = a.episode.airDate?.getTime() ?? 0
    const bTime = b.episode.airDate?.getTime() ?? 0
    if (aTime !== bTime) return aTime - bTime
    const seriesCompare = a.series.title.localeCompare(b.series.title)
    if (seriesCompare !== 0) return seriesCompare
    if (a.season.seasonNumber !== b.season.seasonNumber) {
      return a.season.seasonNumber - b.season.seasonNumber
    }
    return a.episode.episodeNumber - b.episode.episodeNumber
  })
}

function groupEpisodesByDate(rows: ReadonlyArray<CalendarEpisode>) {
  const groups = new Map<string, ReadonlyArray<CalendarEpisode>>()
  for (const row of rows) {
    if (row.episode.airDate === null) continue
    const key = dateKey(row.episode.airDate)
    const current = groups.get(key) ?? []
    groups.set(key, [...current, row])
  }
  return groups
}

function episodeCode(item: CalendarEpisode): string {
  return `S${pad2(item.season.seasonNumber)}E${pad2(item.episode.episodeNumber)}`
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0")
}

function toMonthInputValue(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`
}

function parseMonthInput(value: string): Date {
  if (!monthInputPattern.test(value)) return startOfMonth(new Date())
  const [year, month] = value.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, 1))
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}

function startOfWeek(date: Date): Date {
  const start = startOfMonth(date)
  return addDays(start, -start.getUTCDay())
}

function endOfWeek(date: Date): Date {
  const day = date.getUTCDay()
  return addDays(date, 6 - day)
}

function endOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  )
}

function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

function enumerateDays(start: Date, end: Date): ReadonlyArray<Date> {
  const days: Array<Date> = []
  for (let time = start.getTime(); time <= end.getTime(); time += DAY_MS) {
    days.push(new Date(time))
  }
  return days
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function formatMonth(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date)
}

function formatRange(start: Date, end: Date): string {
  return `${formatDate(start)} - ${formatDate(end)}`
}

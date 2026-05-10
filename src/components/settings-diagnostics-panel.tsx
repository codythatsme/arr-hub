import { AlertTriangle, CheckCircle2 } from "lucide-react"

import type { AggregatedHealth, HealthStatus } from "#/effect/services/DiagnosticsService"

interface SettingsDiagnosticsPanelProps {
  readonly health: AggregatedHealth | undefined
  readonly isLoading: boolean
  readonly errorMessage: string | undefined
  readonly integrationTypes: ReadonlySet<string>
  readonly failureTypes: ReadonlySet<string>
  readonly healthyMessage: string
}

export function SettingsDiagnosticsPanel(props: SettingsDiagnosticsPanelProps) {
  const failures =
    props.health?.failures.filter((failure) => props.failureTypes.has(failure.type)) ?? []
  const items =
    props.health?.integrations.filter((item) => props.integrationTypes.has(item.type)) ?? []
  const hasDiagnostics = failures.length > 0 || items.length > 0

  return (
    <section className="rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Diagnostics</h2>
        {props.health && (
          <span className={`text-xs font-medium uppercase ${statusClass(props.health.status)}`}>
            {props.health.status}
          </span>
        )}
      </div>

      {props.isLoading && <p className="text-muted-foreground mt-3 text-sm">Loading checks...</p>}
      {props.errorMessage && <p className="text-destructive mt-3 text-sm">{props.errorMessage}</p>}

      {!props.isLoading && !props.errorMessage && !hasDiagnostics && (
        <p className="text-muted-foreground mt-3 text-sm">{props.healthyMessage}</p>
      )}

      {failures.length > 0 && (
        <div className="mt-3 space-y-2">
          {failures.map((failure) => (
            <div key={`${failure.type}-${failure.message}`} className="flex gap-2 text-sm">
              <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">{formatLabel(failure.type)}</p>
                <p className="text-muted-foreground">{failure.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-3 divide-y text-sm">
          {items.map((item) => (
            <div key={`${item.type}-${item.id}`} className="flex gap-2 py-2 first:pt-0 last:pb-0">
              <CheckCircle2 className={`mt-0.5 size-4 shrink-0 ${statusClass(item.status)}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="truncate font-medium">{item.name}</p>
                  <span className={statusClass(item.status)}>{item.status}</span>
                </div>
                <p className="text-muted-foreground">
                  {item.message ?? formatLastCheck(item.lastCheck)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function statusClass(status: HealthStatus): string {
  switch (status) {
    case "healthy":
      return "text-emerald-600"
    case "degraded":
      return "text-amber-600"
    case "unhealthy":
      return "text-destructive"
  }
}

function formatLabel(value: string): string {
  return value.replaceAll("_", " ")
}

function formatLastCheck(value: Date | string | null): string {
  if (value === null) return "No health check has run yet."
  return `Last checked ${new Date(value).toLocaleString()}`
}

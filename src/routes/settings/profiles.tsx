import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/profiles")({ component: Profiles })

function Profiles() {
  const trpc = useTRPC()
  const profiles = useQuery(trpc.profiles.list.queryOptions())
  const bundles = useQuery(trpc.profiles.bundles.queryOptions())
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null)
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null)

  const selectedProfile = useMemo(() => {
    const items = profiles.data ?? []
    return items.find((item) => item.profile.id === selectedProfileId) ?? items[0] ?? null
  }, [profiles.data, selectedProfileId])
  const selectedBundle = selectedBundleId ?? selectedProfile?.profile.appliedBundleId ?? "trash-hd"
  const preview = useQuery(
    trpc.profiles.previewReapply.queryOptions(
      { profileId: selectedProfile?.profile.id ?? 0, bundleId: selectedBundle },
      { enabled: selectedProfile !== null },
    ),
  )

  const effective = preview.data ?? selectedProfile

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Profiles</h1>
        <p className="text-muted-foreground mt-1">
          Inspect current profile values and effective bundle previews.
        </p>
      </header>

      {profiles.isLoading && <p className="text-muted-foreground text-sm">Loading profiles...</p>}
      {profiles.error && <p className="text-destructive text-sm">{profiles.error.message}</p>}
      {profiles.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">No quality profiles have been created.</p>
      )}

      {selectedProfile && (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <h2 className="text-lg font-semibold">Quality Profiles</h2>
            <div className="space-y-2">
              {(profiles.data ?? []).map((item) => (
                <button
                  key={item.profile.id}
                  type="button"
                  className="hover:bg-muted w-full rounded-md border p-3 text-left disabled:opacity-50"
                  disabled={item.profile.id === selectedProfile.profile.id}
                  onClick={() => setSelectedProfileId(item.profile.id)}
                >
                  <p className="font-medium">{item.profile.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {item.profile.appliedBundleId ?? "custom"} · {item.qualityItems.length}{" "}
                    qualities
                  </p>
                </button>
              ))}
            </div>

            <label className="block text-sm">
              <span className="font-medium">Preview Bundle</span>
              <select
                className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                value={selectedBundle}
                onChange={(event) => setSelectedBundleId(event.target.value)}
              >
                {(bundles.data ?? []).map((bundle) => (
                  <option key={bundle.id} value={bundle.id}>
                    {bundle.name} v{bundle.version}
                  </option>
                ))}
              </select>
            </label>
          </aside>

          <main className="space-y-6">
            <section className="grid gap-3 sm:grid-cols-4">
              <Metric label="Current" value={selectedProfile.profile.name} />
              <Metric
                label="Bundle"
                value={
                  selectedProfile.profile.appliedBundleId
                    ? `${selectedProfile.profile.appliedBundleId} v${selectedProfile.profile.appliedBundleVersion}`
                    : "none"
                }
              />
              <Metric
                label="Minimum Score"
                value={String(effective?.profile.minFormatScore ?? "unknown")}
              />
              <Metric
                label="Cutoff Score"
                value={String(effective?.profile.cutoffFormatScore ?? "unknown")}
              />
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Effective Qualities</h2>
                <p className="text-muted-foreground text-sm">
                  Shows the selected profile after applying bundle defaults and preserved overrides.
                </p>
              </div>
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Quality</th>
                      <th className="px-3 py-2 text-left font-medium">Group</th>
                      <th className="px-3 py-2 text-right font-medium">Weight</th>
                      <th className="px-3 py-2 text-right font-medium">Allowed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(effective?.qualityItems ?? []).map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2">{item.qualityName ?? "group"}</td>
                        <td className="px-3 py-2">{item.groupName ?? "none"}</td>
                        <td className="px-3 py-2 text-right">{item.weight}</td>
                        <td className="px-3 py-2 text-right">{item.allowed ? "yes" : "no"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Format Scores</h2>
              {(effective?.formatScores.length ?? 0) === 0 && (
                <p className="text-muted-foreground text-sm">No custom format scores configured.</p>
              )}
              {(effective?.formatScores.length ?? 0) > 0 && (
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Format ID</th>
                        <th className="px-3 py-2 text-right font-medium">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(effective?.formatScores ?? []).map((score) => (
                        <tr key={score.id} className="border-t">
                          <td className="px-3 py-2">{score.customFormatId}</td>
                          <td className="px-3 py-2 text-right">{score.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </main>
        </div>
      )}
    </div>
  )
}

function Metric(props: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{props.label}</p>
      <p className="mt-1 truncate font-medium">{props.value}</p>
    </div>
  )
}

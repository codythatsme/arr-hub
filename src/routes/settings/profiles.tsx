import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Plus, RefreshCw, Save, Trash2, X } from "lucide-react"
import { type FormEvent, useEffect, useMemo, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/profiles")({ component: Profiles })

interface QualityItemDraft {
  readonly id: string
  readonly qualityName: string
  readonly groupName: string
  readonly weight: string
  readonly allowed: boolean
}

interface FormatScoreDraft {
  readonly id: string
  readonly customFormatId: string
  readonly score: string
}

const draftId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

const makeQualityItem = (): QualityItemDraft => ({
  id: draftId(),
  qualityName: "",
  groupName: "",
  weight: "0",
  allowed: true,
})

const makeFormatScore = (): FormatScoreDraft => ({
  id: draftId(),
  customFormatId: "",
  score: "0",
})

function Profiles() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [name, setName] = useState("")
  const [upgradeAllowed, setUpgradeAllowed] = useState(true)
  const [minFormatScore, setMinFormatScore] = useState("0")
  const [cutoffFormatScore, setCutoffFormatScore] = useState("0")
  const [minUpgradeFormatScore, setMinUpgradeFormatScore] = useState("1")
  const [isDefault, setIsDefault] = useState(false)
  const [qualityItems, setQualityItems] = useState<ReadonlyArray<QualityItemDraft>>(() => [
    makeQualityItem(),
  ])
  const [formatScores, setFormatScores] = useState<ReadonlyArray<FormatScoreDraft>>([])
  const [selectedBundleId, setSelectedBundleId] = useState("")
  const [forceBundle, setForceBundle] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const profilesKey = trpc.profiles.list.queryKey()
  const profiles = useQuery(trpc.profiles.list.queryOptions())
  const bundles = useQuery(trpc.profiles.bundles.queryOptions())
  const selectedProfile = useMemo(() => {
    if (isCreating) return null
    return (profiles.data ?? []).find((item) => item.profile.id === editingProfileId) ?? null
  }, [editingProfileId, isCreating, profiles.data])
  const activeBundleId =
    selectedBundleId || selectedProfile?.profile.appliedBundleId || bundles.data?.[0]?.id || ""
  const preview = useQuery(
    trpc.profiles.previewReapply.queryOptions(
      { profileId: selectedProfile?.profile.id ?? 0, bundleId: activeBundleId },
      { enabled: selectedProfile !== null && activeBundleId.length > 0 },
    ),
  )
  const effective = preview.data ?? selectedProfile

  const invalidateProfiles = () => queryClient.invalidateQueries({ queryKey: profilesKey })
  const createProfile = useMutation(
    trpc.profiles.create.mutationOptions({
      onSuccess: async (result) => {
        await invalidateProfiles()
        setIsCreating(false)
        setEditingProfileId(result.profile.id)
        setMessage(`Created ${result.profile.name}.`)
      },
    }),
  )
  const updateProfile = useMutation(
    trpc.profiles.update.mutationOptions({
      onSuccess: async (result) => {
        await invalidateProfiles()
        setMessage(`${result.profile.name} saved.`)
      },
    }),
  )
  const deleteProfile = useMutation(
    trpc.profiles.delete.mutationOptions({
      onSuccess: async () => {
        await invalidateProfiles()
        setEditingProfileId(null)
        setMessage("Profile deleted.")
      },
    }),
  )
  const applyBundle = useMutation(
    trpc.profiles.applyBundle.mutationOptions({
      onSuccess: async (result) => {
        await invalidateProfiles()
        setMessage(`Applied ${result.profile.appliedBundleId} to ${result.profile.name}.`)
      },
    }),
  )

  useEffect(() => {
    if (isCreating || editingProfileId !== null) return
    const firstProfile = profiles.data?.[0]
    if (firstProfile) setEditingProfileId(firstProfile.profile.id)
  }, [editingProfileId, isCreating, profiles.data])

  useEffect(() => {
    if (!selectedProfile) return
    setName(selectedProfile.profile.name)
    setUpgradeAllowed(selectedProfile.profile.upgradeAllowed)
    setMinFormatScore(String(selectedProfile.profile.minFormatScore))
    setCutoffFormatScore(String(selectedProfile.profile.cutoffFormatScore))
    setMinUpgradeFormatScore(String(selectedProfile.profile.minUpgradeFormatScore))
    setIsDefault(selectedProfile.profile.isDefault)
    setQualityItems(
      selectedProfile.qualityItems.length > 0
        ? selectedProfile.qualityItems.map((item) => ({
            id: `quality-${item.id}`,
            qualityName: item.qualityName ?? "",
            groupName: item.groupName ?? "",
            weight: String(item.weight),
            allowed: item.allowed,
          }))
        : [makeQualityItem()],
    )
    setFormatScores(
      selectedProfile.formatScores.map((item) => ({
        id: `score-${item.id}`,
        customFormatId: String(item.customFormatId),
        score: String(item.score),
      })),
    )
    setSelectedBundleId(selectedProfile.profile.appliedBundleId ?? "")
    setForceBundle(false)
    setFormError(null)
  }, [selectedProfile])

  const pending =
    createProfile.isPending ||
    updateProfile.isPending ||
    deleteProfile.isPending ||
    applyBundle.isPending
  const error =
    formError ??
    createProfile.error?.message ??
    updateProfile.error?.message ??
    deleteProfile.error?.message ??
    applyBundle.error?.message ??
    profiles.error?.message ??
    bundles.error?.message ??
    preview.error?.message

  const startCreate = () => {
    setIsCreating(true)
    setEditingProfileId(null)
    setName("")
    setUpgradeAllowed(true)
    setMinFormatScore("0")
    setCutoffFormatScore("0")
    setMinUpgradeFormatScore("1")
    setIsDefault(false)
    setQualityItems([makeQualityItem()])
    setFormatScores([])
    setSelectedBundleId(bundles.data?.[0]?.id ?? "")
    setForceBundle(false)
    setMessage(null)
    setFormError(null)
  }

  const selectProfile = (profileId: number) => {
    setIsCreating(false)
    setEditingProfileId(profileId)
    setMessage(null)
    setFormError(null)
  }

  const submitProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setFormError(null)

    const parsedMinScore = parseFiniteNumber(minFormatScore, "Minimum format score")
    const parsedCutoffScore = parseFiniteNumber(cutoffFormatScore, "Cutoff format score")
    const parsedMinUpgradeScore = parseFiniteNumber(minUpgradeFormatScore, "Minimum upgrade score")
    if (typeof parsedMinScore === "string") return setFormError(parsedMinScore)
    if (typeof parsedCutoffScore === "string") return setFormError(parsedCutoffScore)
    if (typeof parsedMinUpgradeScore === "string") return setFormError(parsedMinUpgradeScore)

    const parsedItems = parseQualityItems(qualityItems)
    if (typeof parsedItems === "string") return setFormError(parsedItems)
    const parsedScores = parseFormatScores(formatScores)
    if (typeof parsedScores === "string") return setFormError(parsedScores)

    const payload = {
      name: name.trim(),
      upgradeAllowed,
      minFormatScore: parsedMinScore,
      cutoffFormatScore: parsedCutoffScore,
      minUpgradeFormatScore: parsedMinUpgradeScore,
      isDefault,
      qualityItems: parsedItems,
      formatScores: parsedScores,
    }

    if (selectedProfile) {
      updateProfile.mutate({ id: selectedProfile.profile.id, data: payload })
      return
    }
    createProfile.mutate(payload)
  }

  const updateQualityItem = (
    index: number,
    updater: (item: QualityItemDraft) => QualityItemDraft,
  ) => {
    setQualityItems((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item)),
    )
  }

  const updateFormatScore = (
    index: number,
    updater: (item: FormatScoreDraft) => FormatScoreDraft,
  ) => {
    setFormatScores((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item)),
    )
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Profiles</h1>
        <p className="text-muted-foreground mt-1">
          Create profiles, edit quality rules, and apply bundled defaults.
        </p>
      </header>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {profiles.isLoading && <p className="text-muted-foreground text-sm">Loading profiles...</p>}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <button
            type="button"
            className="bg-primary text-primary-foreground inline-flex w-full items-center justify-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
            onClick={startCreate}
            disabled={pending}
          >
            <Plus className="size-4" />
            New profile
          </button>

          <section className="space-y-2">
            {(profiles.data ?? []).map((item) => (
              <button
                key={item.profile.id}
                type="button"
                className="hover:bg-muted w-full rounded-md border p-3 text-left disabled:opacity-50"
                disabled={!isCreating && item.profile.id === selectedProfile?.profile.id}
                onClick={() => selectProfile(item.profile.id)}
              >
                <p className="font-medium">{item.profile.name}</p>
                <p className="text-muted-foreground text-xs">
                  {item.profile.isDefault ? "default" : "custom"} ·{" "}
                  {item.profile.appliedBundleId ?? "no bundle"} · {item.qualityItems.length}{" "}
                  qualities
                </p>
              </button>
            ))}
            {profiles.data?.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No quality profiles have been created.
              </p>
            )}
          </section>

          {selectedProfile && (
            <section className="rounded-md border p-4">
              <h2 className="text-lg font-semibold">Bundle Apply</h2>
              <label className="mt-4 block text-sm">
                <span className="font-medium">Bundle</span>
                <select
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={activeBundleId}
                  onChange={(event) => setSelectedBundleId(event.target.value)}
                >
                  {(bundles.data ?? []).map((bundle) => (
                    <option key={bundle.id} value={bundle.id}>
                      {bundle.name} v{bundle.version}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={forceBundle}
                  onChange={(event) => setForceBundle(event.target.checked)}
                />
                Force same-version apply
              </label>
              <button
                type="button"
                className="mt-4 inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
                disabled={pending || activeBundleId.length === 0}
                onClick={() => {
                  setMessage(null)
                  applyBundle.mutate({
                    profileId: selectedProfile.profile.id,
                    bundleId: activeBundleId,
                    force: forceBundle,
                  })
                }}
              >
                <RefreshCw className="size-4" />
                Apply bundle
              </button>
            </section>
          )}
        </aside>

        <main className="space-y-6">
          <form className="rounded-md border p-4" onSubmit={submitProfile}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {selectedProfile ? "Edit Profile" : "Create Profile"}
                </h2>
                <p className="text-muted-foreground text-sm">
                  Changes replace the profile quality items and format scores.
                </p>
              </div>
              {selectedProfile && (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
                  disabled={pending}
                  onClick={() => deleteProfile.mutate({ id: selectedProfile.profile.id })}
                >
                  <Trash2 className="size-4" />
                  Delete
                </button>
              )}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium">Name</span>
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </label>
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={upgradeAllowed}
                    onChange={(event) => setUpgradeAllowed(event.target.checked)}
                  />
                  Upgrade allowed
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(event) => setIsDefault(event.target.checked)}
                  />
                  Default profile
                </label>
              </div>
              <label className="block text-sm">
                <span className="font-medium">Minimum format score</span>
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={minFormatScore}
                  onChange={(event) => setMinFormatScore(event.target.value)}
                  type="number"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Cutoff format score</span>
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={cutoffFormatScore}
                  onChange={(event) => setCutoffFormatScore(event.target.value)}
                  type="number"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Minimum upgrade score</span>
                <input
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={minUpgradeFormatScore}
                  onChange={(event) => setMinUpgradeFormatScore(event.target.value)}
                  type="number"
                />
              </label>
            </div>

            <section className="mt-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">Quality Items</h3>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                  onClick={() => setQualityItems((items) => [...items, makeQualityItem()])}
                >
                  <Plus className="size-3" />
                  Add quality
                </button>
              </div>
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Quality</th>
                      <th className="px-3 py-2 text-left font-medium">Group</th>
                      <th className="px-3 py-2 text-right font-medium">Weight</th>
                      <th className="px-3 py-2 text-right font-medium">Allowed</th>
                      <th className="px-3 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qualityItems.map((item, index) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2">
                          <input
                            className="w-full rounded border bg-transparent px-2 py-1"
                            value={item.qualityName}
                            onChange={(event) =>
                              updateQualityItem(index, (current) => ({
                                ...current,
                                qualityName: event.target.value,
                              }))
                            }
                            placeholder="WEBDL1080p"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-full rounded border bg-transparent px-2 py-1"
                            value={item.groupName}
                            onChange={(event) =>
                              updateQualityItem(index, (current) => ({
                                ...current,
                                groupName: event.target.value,
                              }))
                            }
                            placeholder="WEB 1080p"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="ml-auto w-24 rounded border bg-transparent px-2 py-1 text-right"
                            value={item.weight}
                            onChange={(event) =>
                              updateQualityItem(index, (current) => ({
                                ...current,
                                weight: event.target.value,
                              }))
                            }
                            type="number"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="checkbox"
                            checked={item.allowed}
                            onChange={(event) =>
                              updateQualityItem(index, (current) => ({
                                ...current,
                                allowed: event.target.checked,
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            aria-label="Remove quality item"
                            className="rounded border p-1.5"
                            onClick={() =>
                              setQualityItems((items) =>
                                items.filter((_, itemIndex) => itemIndex !== index),
                              )
                            }
                          >
                            <X className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">Format Scores</h3>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                  onClick={() => setFormatScores((items) => [...items, makeFormatScore()])}
                >
                  <Plus className="size-3" />
                  Add score
                </button>
              </div>
              {(formatScores.length === 0 && (
                <p className="text-muted-foreground text-sm">No custom format scores configured.</p>
              )) || (
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Custom Format ID</th>
                        <th className="px-3 py-2 text-right font-medium">Score</th>
                        <th className="px-3 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formatScores.map((item, index) => (
                        <tr key={item.id} className="border-t">
                          <td className="px-3 py-2">
                            <input
                              className="w-full rounded border bg-transparent px-2 py-1"
                              value={item.customFormatId}
                              onChange={(event) =>
                                updateFormatScore(index, (current) => ({
                                  ...current,
                                  customFormatId: event.target.value,
                                }))
                              }
                              type="number"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="ml-auto w-24 rounded border bg-transparent px-2 py-1 text-right"
                              value={item.score}
                              onChange={(event) =>
                                updateFormatScore(index, (current) => ({
                                  ...current,
                                  score: event.target.value,
                                }))
                              }
                              type="number"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              aria-label="Remove format score"
                              className="rounded border p-1.5"
                              onClick={() =>
                                setFormatScores((items) =>
                                  items.filter((_, itemIndex) => itemIndex !== index),
                                )
                              }
                            >
                              <X className="size-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <button
              type="submit"
              className="bg-primary text-primary-foreground mt-6 inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
              disabled={pending}
            >
              <Save className="size-4" />
              {selectedProfile ? "Save profile" : "Create profile"}
            </button>
          </form>

          {effective && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Effective Preview</h2>
                <p className="text-muted-foreground text-sm">
                  Shows the selected profile after applying the selected bundle.
                </p>
              </div>
              <section className="grid gap-3 sm:grid-cols-4">
                <Metric label="Profile" value={effective.profile.name} />
                <Metric
                  label="Bundle"
                  value={
                    effective.profile.appliedBundleId
                      ? `${effective.profile.appliedBundleId} v${effective.profile.appliedBundleVersion}`
                      : "none"
                  }
                />
                <Metric label="Minimum Score" value={String(effective.profile.minFormatScore)} />
                <Metric label="Cutoff Score" value={String(effective.profile.cutoffFormatScore)} />
              </section>
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
                    {effective.qualityItems.map((item) => (
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
          )}
        </main>
      </div>
    </div>
  )
}

function parseFiniteNumber(value: string, label: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return `${label} must be a number.`
  return parsed
}

function parseQualityItems(items: ReadonlyArray<QualityItemDraft>) {
  const parsed: Array<{
    readonly qualityName: string | null
    readonly groupName: string | null
    readonly weight: number
    readonly allowed: boolean
  }> = []

  for (const [index, item] of items.entries()) {
    const qualityName = item.qualityName.trim()
    const groupName = item.groupName.trim()
    if (qualityName.length === 0 && groupName.length === 0) continue

    const weight = Number(item.weight)
    if (!Number.isFinite(weight)) return `Quality item ${index + 1} weight must be a number.`

    parsed.push({
      qualityName: qualityName.length > 0 ? qualityName : null,
      groupName: groupName.length > 0 ? groupName : null,
      weight,
      allowed: item.allowed,
    })
  }

  return parsed
}

function parseFormatScores(items: ReadonlyArray<FormatScoreDraft>) {
  const parsed: Array<{
    readonly customFormatId: number
    readonly score: number
  }> = []

  for (const [index, item] of items.entries()) {
    if (item.customFormatId.trim().length === 0) continue

    const customFormatId = Number(item.customFormatId)
    if (!Number.isInteger(customFormatId) || customFormatId <= 0) {
      return `Format score ${index + 1} custom format ID must be a positive whole number.`
    }

    const score = Number(item.score)
    if (!Number.isFinite(score)) return `Format score ${index + 1} must be a number.`

    parsed.push({ customFormatId, score })
  }

  return parsed
}

function Metric(props: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{props.label}</p>
      <p className="mt-1 truncate font-medium">{props.value}</p>
    </div>
  )
}

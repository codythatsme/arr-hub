import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"
import { setAuthToken } from "#/lib/auth-token"

export const Route = createFileRoute("/settings/security")({ component: Security })

const apiKeyScopeOptions = [
  { value: "app", label: "Full app" },
  { value: "api-read", label: "REST read-only" },
  { value: "api-write", label: "REST read/write" },
] as const

type ApiKeyScopePreset = (typeof apiKeyScopeOptions)[number]["value"]

function scopesForPreset(preset: ApiKeyScopePreset): Array<"app" | "api:read" | "api:write"> {
  switch (preset) {
    case "api-read":
      return ["api:read"]
    case "api-write":
      return ["api:read", "api:write"]
    default:
      return ["app"]
  }
}

function scopeLabel(scopes: ReadonlyArray<string>): string {
  if (scopes.includes("app")) return "Full app"
  if (scopes.includes("api:write")) return "REST read/write"
  if (scopes.includes("api:read")) return "REST read-only"
  return "Unknown"
}

function Security() {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [scopePreset, setScopePreset] = useState<ApiKeyScopePreset>("app")
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const keysKey = trpc.auth.listApiKeys.queryKey()
  const keys = useQuery(trpc.auth.listApiKeys.queryOptions())
  const createKey = useMutation(
    trpc.auth.createApiKey.mutationOptions({
      onSuccess: (result) => {
        setCreatedToken(result.token)
        setName("")
        setScopePreset("app")
        queryClient.invalidateQueries({ queryKey: keysKey })
      },
    }),
  )
  const revokeKey = useMutation(
    trpc.auth.revokeApiKey.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: keysKey }),
    }),
  )
  const changePassword = useMutation(
    trpc.auth.changePassword.mutationOptions({
      onSuccess: async () => {
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
        setAuthToken(null)
        await queryClient.invalidateQueries()
        void navigate({ to: "/login" })
      },
      onError: (error) => setPasswordError(error.message),
    }),
  )

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Security</h1>
        <p className="text-muted-foreground mt-1">Authentication and access control</p>
      </header>

      <section className="rounded-md border p-4">
        <h2 className="font-semibold">Admin Password</h2>
        <form
          className="mt-3 grid max-w-xl gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            setPasswordError(null)
            if (newPassword !== confirmPassword) {
              setPasswordError("new passwords do not match")
              return
            }
            changePassword.mutate({ currentPassword, newPassword })
          }}
        >
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Current password</span>
            <input
              className="bg-background rounded border px-3 py-2"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">New password</span>
            <input
              className="bg-background rounded border px-3 py-2"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Confirm new password</span>
            <input
              className="bg-background rounded border px-3 py-2"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          {passwordError && <p className="text-destructive text-sm">{passwordError}</p>}
          <button
            type="submit"
            className="w-fit rounded border px-3 py-2 text-sm disabled:opacity-50"
            disabled={
              changePassword.isPending ||
              currentPassword.length === 0 ||
              newPassword.length < 8 ||
              confirmPassword.length < 8
            }
          >
            {changePassword.isPending ? "Changing..." : "Change password"}
          </button>
        </form>
      </section>

      <section className="rounded-md border p-4">
        <h2 className="font-semibold">API Keys</h2>
        <form
          className="mt-3 grid max-w-2xl gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) {
              createKey.mutate({ name: name.trim(), scopes: scopesForPreset(scopePreset) })
            }
          }}
        >
          <input
            className="bg-background flex-1 rounded border px-3 py-2 text-sm"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Key name"
          />
          <select
            className="bg-background rounded border px-3 py-2 text-sm"
            value={scopePreset}
            onChange={(event) => setScopePreset(event.target.value as ApiKeyScopePreset)}
          >
            {apiKeyScopeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
            disabled={!name.trim() || createKey.isPending}
          >
            Create
          </button>
        </form>
        {createdToken && (
          <div className="bg-muted mt-3 rounded p-3 text-sm">
            <p className="text-muted-foreground">New token</p>
            <p className="mt-1 font-mono break-all">{createdToken}</p>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Kind</th>
              <th className="px-3 py-2 text-left font-medium">Scope</th>
              <th className="px-3 py-2 text-left font-medium">Last Used</th>
              <th className="px-3 py-2 text-left font-medium">Created</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.data?.map((key) => (
              <tr key={key.id} className="border-t">
                <td className="px-3 py-2">{key.name}</td>
                <td className="px-3 py-2">{key.kind}</td>
                <td className="px-3 py-2">{scopeLabel(key.scopes)}</td>
                <td className="text-muted-foreground px-3 py-2">
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}
                </td>
                <td className="text-muted-foreground px-3 py-2">
                  {new Date(key.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                    disabled={key.revokedAt !== null || revokeKey.isPending}
                    onClick={() => revokeKey.mutate({ id: key.id })}
                  >
                    {key.revokedAt ? "Revoked" : "Revoke"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

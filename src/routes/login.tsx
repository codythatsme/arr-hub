import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { useTRPC } from "#/integrations/trpc/react"
import { setAuthToken } from "#/lib/auth-token"

export const Route = createFileRoute("/login")({ component: Login })

function Login() {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryToken, setRecoveryToken] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const [recoveryComplete, setRecoveryComplete] = useState(false)

  const mutation = useMutation(
    trpc.auth.login.mutationOptions({
      onSuccess: async (data) => {
        setAuthToken(data.token)
        await queryClient.invalidateQueries()
        void navigate({ to: "/" })
      },
      onError: (e) => setError(e.message),
    }),
  )
  const recoverPassword = useMutation(
    trpc.auth.recoverPassword.mutationOptions({
      onSuccess: () => {
        setPassword("")
        setRecoveryToken("")
        setNewPassword("")
        setConfirmPassword("")
        setRecoveryError(null)
        setRecoveryComplete(true)
        setShowRecovery(false)
      },
      onError: (e) => setRecoveryError(e.message),
    }),
  )

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <form
        className="w-full max-w-sm space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          mutation.mutate({ username, password })
        }}
      >
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="text-muted-foreground text-sm">arr-hub admin login</p>
        </header>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Username</span>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Password</span>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <Button type="submit" disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? "Signing in…" : "Sign in"}
        </Button>

        {recoveryComplete && (
          <p className="text-muted-foreground text-sm">
            Password reset. Sign in with the new password.
          </p>
        )}

        <button
          type="button"
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
          onClick={() => {
            setShowRecovery((value) => !value)
            setRecoveryError(null)
            setRecoveryComplete(false)
          }}
        >
          {showRecovery ? "Cancel recovery" : "Recover password"}
        </button>

        {showRecovery && (
          <section className="space-y-4 border-t pt-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Recovery token</span>
              <Input
                type="password"
                value={recoveryToken}
                onChange={(e) => setRecoveryToken(e.target.value)}
                autoComplete="one-time-code"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">New password</span>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Confirm new password</span>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            {recoveryError && <p className="text-destructive text-sm">{recoveryError}</p>}

            <Button
              type="button"
              variant="outline"
              disabled={
                recoverPassword.isPending ||
                username.trim().length === 0 ||
                recoveryToken.length === 0 ||
                newPassword.length < 8 ||
                confirmPassword.length < 8
              }
              className="w-full"
              onClick={() => {
                setRecoveryError(null)
                setRecoveryComplete(false)
                if (newPassword !== confirmPassword) {
                  setRecoveryError("new passwords do not match")
                  return
                }
                recoverPassword.mutate({
                  username,
                  recoveryToken,
                  newPassword,
                })
              }}
            >
              {recoverPassword.isPending ? "Resetting…" : "Reset password"}
            </Button>
          </section>
        )}
      </form>
    </div>
  )
}

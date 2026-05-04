import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/security")({ component: Security })

function Security() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const keysKey = trpc.auth.listApiKeys.queryKey()
  const keys = useQuery(trpc.auth.listApiKeys.queryOptions())
  const createKey = useMutation(
    trpc.auth.createApiKey.mutationOptions({
      onSuccess: (result) => {
        setCreatedToken(result.token)
        setName("")
        queryClient.invalidateQueries({ queryKey: keysKey })
      },
    }),
  )
  const revokeKey = useMutation(
    trpc.auth.revokeApiKey.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: keysKey }),
    }),
  )

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Security</h1>
        <p className="text-muted-foreground mt-1">Authentication and access control</p>
      </header>

      <section className="rounded-md border p-4">
        <h2 className="font-semibold">API Keys</h2>
        <form
          className="mt-3 flex max-w-xl gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) createKey.mutate({ name: name.trim() })
          }}
        >
          <input
            className="bg-background flex-1 rounded border px-3 py-2 text-sm"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Key name"
          />
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

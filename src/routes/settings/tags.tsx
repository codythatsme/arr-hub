import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Plus, Tags, Trash2 } from "lucide-react"
import { type FormEvent, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/settings/tags")({ component: TagsSettings })

function TagsSettings() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [label, setLabel] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const tagsKey = trpc.tags.list.queryKey()
  const tags = useQuery(trpc.tags.list.queryOptions())
  const createTag = useMutation(
    trpc.tags.create.mutationOptions({
      onSuccess: async (result) => {
        setLabel("")
        setMessage(`Tag ${result.tag.label} saved.`)
        await queryClient.invalidateQueries({ queryKey: tagsKey })
      },
    }),
  )
  const removeTag = useMutation(
    trpc.tags.remove.mutationOptions({
      onSuccess: async () => {
        setMessage("Tag removed.")
        await queryClient.invalidateQueries({ queryKey: tagsKey })
      },
    }),
  )

  const pending = createTag.isPending || removeTag.isPending
  const error = createTag.error?.message ?? removeTag.error?.message ?? tags.error?.message

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    createTag.mutate({ label })
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Tags</h1>
        <p className="text-muted-foreground mt-1">Shared labels for media and indexer policies</p>
      </header>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      <form className="rounded-md border p-4" onSubmit={submit}>
        <h2 className="text-lg font-semibold">Create Tag</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="min-w-64 flex-1 text-sm">
            <span className="font-medium">Label</span>
            <input
              className="mt-1 w-full rounded border bg-transparent px-3 py-2"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="anime"
              required
            />
          </label>
          <button
            type="submit"
            className="bg-primary text-primary-foreground mt-6 inline-flex items-center gap-2 rounded px-3 py-2 text-sm disabled:opacity-50"
            disabled={pending || label.trim().length === 0}
          >
            <Plus className="size-4" />
            Add tag
          </button>
        </div>
      </form>

      <section className="rounded-md border">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Tags className="size-4" />
          <h2 className="font-semibold">Tag Library</h2>
        </div>
        <div className="divide-y">
          {tags.isLoading && <p className="text-muted-foreground p-4 text-sm">Loading tags...</p>}
          {tags.data?.length === 0 && (
            <p className="text-muted-foreground p-4 text-sm">No tags have been created.</p>
          )}
          {tags.data?.map((item) => (
            <div
              key={item.tag.id}
              className="grid items-center gap-3 p-4 text-sm sm:grid-cols-[1fr_auto_auto]"
            >
              <span className="font-medium">{item.tag.label}</span>
              <span className="text-muted-foreground">
                {item.usageCount} use{item.usageCount === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
                disabled={pending || item.usageCount > 0}
                onClick={() => {
                  setMessage(null)
                  removeTag.mutate({ id: item.tag.id })
                }}
              >
                <Trash2 className="size-4" />
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

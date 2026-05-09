import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { createFileRoute } from "@tanstack/react-router"
import { Plus, Search, Trash2 } from "lucide-react"
import { type FormEvent, useState } from "react"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/movies/")({ component: Movies })

type StatusFilter = "all" | "wanted" | "available" | "missing"
type MonitoredFilter = "all" | "monitored" | "unmonitored"

function Movies() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<StatusFilter>("all")
  const [monitored, setMonitored] = useState<MonitoredFilter>("all")
  const [searchInput, setSearchInput] = useState("")
  const [tmdbQuery, setTmdbQuery] = useState("")
  const [qualityProfileId, setQualityProfileId] = useState("")
  const [rootFolderPath, setRootFolderPath] = useState("")
  const [monitoredOnAdd, setMonitoredOnAdd] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  const filters = {
    status: status === "all" ? undefined : status,
    monitored:
      monitored === "all" ? undefined : monitored === "monitored" ? true : (false as boolean),
  }
  const listKey = trpc.movies.list.queryKey(filters)
  const movies = useQuery(trpc.movies.list.queryOptions(filters))
  const tmdbResults = useQuery(
    trpc.tmdb.searchMovies.queryOptions(
      { query: tmdbQuery },
      { enabled: tmdbQuery.trim().length >= 2 },
    ),
  )
  const profiles = useQuery(trpc.profiles.list.queryOptions())
  const rootFolders = useQuery(trpc.rootFolders.list.queryOptions())

  const invalidateMovies = () => queryClient.invalidateQueries({ queryKey: listKey })
  const addMovie = useMutation(
    trpc.movies.add.mutationOptions({
      onSuccess: async (movie) => {
        await invalidateMovies()
        setMessage(`Added ${movie.title}.`)
      },
    }),
  )
  const updateMovie = useMutation(
    trpc.movies.update.mutationOptions({
      onSuccess: async (movie) => {
        await invalidateMovies()
        setMessage(`${movie.title} updated.`)
      },
    }),
  )
  const removeMovie = useMutation(
    trpc.movies.remove.mutationOptions({
      onSuccess: async () => {
        await invalidateMovies()
        setMessage("Movie removed.")
      },
    }),
  )

  const pending = addMovie.isPending || updateMovie.isPending || removeMovie.isPending
  const error =
    addMovie.error?.message ??
    updateMovie.error?.message ??
    removeMovie.error?.message ??
    movies.error?.message ??
    tmdbResults.error?.message ??
    profiles.error?.message ??
    rootFolders.error?.message

  const searchTmdb = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setTmdbQuery(searchInput.trim())
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Movies</h1>
          <p className="text-muted-foreground mt-1">Browse, add, and manage monitored movies.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            className="bg-background rounded border px-2 py-1"
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="wanted">Wanted</option>
            <option value="available">Available</option>
            <option value="missing">Missing</option>
          </select>
          <select
            className="bg-background rounded border px-2 py-1"
            value={monitored}
            onChange={(event) => setMonitored(event.target.value as MonitoredFilter)}
          >
            <option value="all">All monitoring</option>
            <option value="monitored">Monitored</option>
            <option value="unmonitored">Unmonitored</option>
          </select>
        </div>
      </header>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          {movies.isLoading && <p className="text-muted-foreground text-sm">Loading movies...</p>}
          {movies.data?.length === 0 && (
            <p className="text-muted-foreground text-sm">No movies match the current filters.</p>
          )}
          {movies.data && movies.data.length > 0 && (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Root</th>
                    <th className="px-3 py-2 text-right font-medium">Quality</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {movies.data.map((movie) => (
                    <tr key={movie.id} className="border-t">
                      <td className="px-3 py-2">
                        <Link
                          to="/movies/$id"
                          params={{ id: String(movie.id) }}
                          className="font-medium hover:underline"
                        >
                          {movie.title}
                          {movie.year ? ` (${movie.year})` : ""}
                        </Link>
                        <p className="text-muted-foreground text-xs">
                          {movie.monitored ? "monitored" : "unmonitored"}
                        </p>
                      </td>
                      <td className="px-3 py-2">{movie.status}</td>
                      <td className="max-w-64 px-3 py-2">
                        <p className="truncate font-mono text-xs">
                          {movie.rootFolderPath ?? "unset"}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {movie.existingQualityName ?? "none"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                            disabled={pending}
                            onClick={() =>
                              updateMovie.mutate({
                                id: movie.id,
                                data: { monitored: !movie.monitored },
                              })
                            }
                          >
                            {movie.monitored ? "Unmonitor" : "Monitor"}
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${movie.title}`}
                            className="rounded border p-1.5 disabled:opacity-50"
                            disabled={pending}
                            onClick={() => removeMovie.mutate({ id: movie.id })}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <form className="rounded-md border p-4" onSubmit={searchTmdb}>
            <h2 className="text-lg font-semibold">Add Movie</h2>
            <label className="mt-4 block text-sm">
              <span className="font-medium">TMDB search</span>
              <div className="mt-1 flex gap-2">
                <input
                  className="w-full rounded border bg-transparent px-3 py-2"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Movie title"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"
                  disabled={searchInput.trim().length < 2}
                >
                  <Search className="size-4" />
                  Search
                </button>
              </div>
            </label>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <label className="block text-sm">
                <span className="font-medium">Quality profile</span>
                <select
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={qualityProfileId}
                  onChange={(event) => setQualityProfileId(event.target.value)}
                >
                  <option value="">None</option>
                  {(profiles.data ?? []).map((item) => (
                    <option key={item.profile.id} value={item.profile.id}>
                      {item.profile.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium">Root folder</span>
                <select
                  className="mt-1 w-full rounded border bg-transparent px-3 py-2"
                  value={rootFolderPath}
                  onChange={(event) => setRootFolderPath(event.target.value)}
                >
                  <option value="">Unset</option>
                  {(rootFolders.data ?? []).map((folder) => (
                    <option key={folder.id} value={folder.path}>
                      {folder.path}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={monitoredOnAdd}
                onChange={(event) => setMonitoredOnAdd(event.target.checked)}
              />
              Monitor when added
            </label>
          </form>

          <div className="space-y-2">
            {tmdbResults.isLoading && (
              <p className="text-muted-foreground text-sm">Searching TMDB...</p>
            )}
            {tmdbResults.data?.results.map((movie) => (
              <article key={movie.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">
                      {movie.title}
                      {movie.year ? ` (${movie.year})` : ""}
                    </h3>
                    {movie.overview && (
                      <p className="text-muted-foreground mt-1 line-clamp-3 text-sm">
                        {movie.overview}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50"
                    disabled={pending}
                    onClick={() =>
                      addMovie.mutate({
                        tmdbId: movie.id,
                        title: movie.title,
                        year: movie.year,
                        overview: movie.overview,
                        posterPath: movie.posterPath,
                        status: "wanted",
                        qualityProfileId:
                          qualityProfileId.length > 0 ? Number(qualityProfileId) : null,
                        rootFolderPath: rootFolderPath.length > 0 ? rootFolderPath : null,
                        monitored: monitoredOnAdd,
                      })
                    }
                  >
                    <Plus className="size-3" />
                    Add
                  </button>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </div>
  )
}

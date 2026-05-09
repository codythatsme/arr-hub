import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { createFileRoute } from "@tanstack/react-router"

import { useTRPC } from "#/integrations/trpc/react"

export const Route = createFileRoute("/movies/")({ component: Movies })

function Movies() {
  const trpc = useTRPC()
  const query = useQuery(trpc.movies.list.queryOptions(null))

  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="text-2xl font-bold">Movies</h1>
        <p className="text-muted-foreground mt-1">Browse and manage your movie collection</p>
      </header>

      {query.isLoading && <p className="text-muted-foreground text-sm">Loading movies...</p>}
      {query.error && <p className="text-destructive text-sm">{query.error.message}</p>}
      {query.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">No movies have been added yet.</p>
      )}
      {query.data && query.data.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Quality</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((movie) => (
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
                  </td>
                  <td className="px-3 py-2">{movie.status}</td>
                  <td className="px-3 py-2 text-right">{movie.existingQualityName ?? "none"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

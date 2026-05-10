import { createFileRoute } from "@tanstack/react-router"

import { createMovieHandler, listMoviesHandler } from "#/integrations/http/compatMovies"

export const Route = createFileRoute("/api/$version/movie")({
  server: {
    handlers: {
      GET: listMoviesHandler,
      POST: createMovieHandler,
    },
  },
})

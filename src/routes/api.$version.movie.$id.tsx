import { createFileRoute } from "@tanstack/react-router"

import {
  deleteMovieHandler,
  getMovieHandler,
  updateMovieHandler,
} from "#/integrations/http/compatMovies"

export const Route = createFileRoute("/api/$version/movie/$id")({
  server: {
    handlers: {
      DELETE: deleteMovieHandler,
      GET: getMovieHandler,
      PUT: updateMovieHandler,
    },
  },
})

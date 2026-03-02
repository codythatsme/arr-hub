import { createTRPCRouter } from "./init"
import { authRouter } from "./routers/auth"
import { downloadClientsRouter } from "./routers/downloadClients"
import { formatsRouter } from "./routers/formats"
import { indexersRouter } from "./routers/indexers"
import { moviesRouter } from "./routers/movies"
import { profilesRouter } from "./routers/profiles"
import { seriesRouter } from "./routers/series"

export const trpcRouter = createTRPCRouter({
  auth: authRouter,
  movies: moviesRouter,
  series: seriesRouter,
  profiles: profilesRouter,
  formats: formatsRouter,
  indexers: indexersRouter,
  downloadClients: downloadClientsRouter,
})

export type TRPCRouter = typeof trpcRouter

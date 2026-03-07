import { createTRPCRouter } from "./init"
import { authRouter } from "./routers/auth"
import { downloadClientsRouter } from "./routers/downloadClients"
import { formatsRouter } from "./routers/formats"
import { indexersRouter } from "./routers/indexers"
import { mediaServersRouter } from "./routers/mediaServers"
import { moviesRouter } from "./routers/movies"
import { profilesRouter } from "./routers/profiles"
import { releasesRouter } from "./routers/releases"
import { rootFoldersRouter } from "./routers/rootFolders"
import { schedulerRouter } from "./routers/scheduler"
import { seriesRouter } from "./routers/series"
import { tmdbRouter } from "./routers/tmdb"

export const trpcRouter = createTRPCRouter({
  auth: authRouter,
  movies: moviesRouter,
  series: seriesRouter,
  profiles: profilesRouter,
  formats: formatsRouter,
  indexers: indexersRouter,
  downloadClients: downloadClientsRouter,
  mediaServers: mediaServersRouter,
  releases: releasesRouter,
  rootFolders: rootFoldersRouter,
  scheduler: schedulerRouter,
  tmdb: tmdbRouter,
})

export type TRPCRouter = typeof trpcRouter

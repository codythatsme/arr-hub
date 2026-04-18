import { createTRPCRouter } from "./init"
import { authRouter } from "./routers/auth"
import { downloadClientsRouter } from "./routers/downloadClients"
import { formatsRouter } from "./routers/formats"
import { historyRouter } from "./routers/history"
import { importRouter } from "./routers/import"
import { indexersRouter } from "./routers/indexers"
import { mediaServersRouter } from "./routers/mediaServers"
import { moviesRouter } from "./routers/movies"
import { onboardingRouter } from "./routers/onboarding"
import { plexUsersRouter } from "./routers/plexUsers"
import { profilesRouter } from "./routers/profiles"
import { releasesRouter } from "./routers/releases"
import { rootFoldersRouter } from "./routers/rootFolders"
import { schedulerRouter } from "./routers/scheduler"
import { seriesRouter } from "./routers/series"
import { tmdbRouter } from "./routers/tmdb"

export const trpcRouter = createTRPCRouter({
  auth: authRouter,
  onboarding: onboardingRouter,
  movies: moviesRouter,
  series: seriesRouter,
  profiles: profilesRouter,
  formats: formatsRouter,
  indexers: indexersRouter,
  downloadClients: downloadClientsRouter,
  mediaServers: mediaServersRouter,
  plexUsers: plexUsersRouter,
  history: historyRouter,
  import: importRouter,
  releases: releasesRouter,
  rootFolders: rootFoldersRouter,
  scheduler: schedulerRouter,
  tmdb: tmdbRouter,
})

export type TRPCRouter = typeof trpcRouter

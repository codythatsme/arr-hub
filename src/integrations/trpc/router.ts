import { createTRPCRouter } from "./init"
import { authRouter } from "./routers/auth"
import { diagnosticsRouter } from "./routers/diagnostics"
import { downloadClientsRouter } from "./routers/downloadClients"
import { formatsRouter } from "./routers/formats"
import { historyRouter } from "./routers/history"
import { importRouter } from "./routers/import"
import { indexerApplicationsRouter } from "./routers/indexerApplications"
import { indexersRouter } from "./routers/indexers"
import { mediaManagementRouter } from "./routers/mediaManagement"
import { mediaServersRouter } from "./routers/mediaServers"
import { moviesRouter } from "./routers/movies"
import { notificationsRouter } from "./routers/notifications"
import { onboardingRouter } from "./routers/onboarding"
import { plexUsersRouter } from "./routers/plexUsers"
import { pluginsRouter } from "./routers/plugins"
import { profilesRouter } from "./routers/profiles"
import { queueRouter } from "./routers/queue"
import { releasesRouter } from "./routers/releases"
import { rootFoldersRouter } from "./routers/rootFolders"
import { schedulerRouter } from "./routers/scheduler"
import { seriesRouter } from "./routers/series"
import { settingsRouter } from "./routers/settings"
import { statsRouter } from "./routers/stats"
import { tmdbRouter } from "./routers/tmdb"

export const trpcRouter = createTRPCRouter({
  auth: authRouter,
  onboarding: onboardingRouter,
  movies: moviesRouter,
  notifications: notificationsRouter,
  series: seriesRouter,
  profiles: profilesRouter,
  settings: settingsRouter,
  formats: formatsRouter,
  indexers: indexersRouter,
  indexerApplications: indexerApplicationsRouter,
  downloadClients: downloadClientsRouter,
  mediaManagement: mediaManagementRouter,
  mediaServers: mediaServersRouter,
  plexUsers: plexUsersRouter,
  plugins: pluginsRouter,
  history: historyRouter,
  import: importRouter,
  releases: releasesRouter,
  queue: queueRouter,
  rootFolders: rootFoldersRouter,
  scheduler: schedulerRouter,
  stats: statsRouter,
  diagnostics: diagnosticsRouter,
  tmdb: tmdbRouter,
})

export type TRPCRouter = typeof trpcRouter

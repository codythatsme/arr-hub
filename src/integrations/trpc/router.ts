import { createTRPCRouter } from './init'
import { authRouter } from './routers/auth'
import { moviesRouter } from './routers/movies'
import { profilesRouter } from './routers/profiles'
import { formatsRouter } from './routers/formats'
import { indexersRouter } from './routers/indexers'

export const trpcRouter = createTRPCRouter({
  auth: authRouter,
  movies: moviesRouter,
  profiles: profilesRouter,
  formats: formatsRouter,
  indexers: indexersRouter,
})

export type TRPCRouter = typeof trpcRouter

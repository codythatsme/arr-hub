import { createTRPCRouter } from './init'
import { authRouter } from './routers/auth'
import { moviesRouter } from './routers/movies'
import { profilesRouter } from './routers/profiles'
import { formatsRouter } from './routers/formats'

export const trpcRouter = createTRPCRouter({
  auth: authRouter,
  movies: moviesRouter,
  profiles: profilesRouter,
  formats: formatsRouter,
})

export type TRPCRouter = typeof trpcRouter

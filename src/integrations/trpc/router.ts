import { createTRPCRouter } from './init'
import { authRouter } from './routers/auth'
import { moviesRouter } from './routers/movies'

export const trpcRouter = createTRPCRouter({
  auth: authRouter,
  movies: moviesRouter,
})

export type TRPCRouter = typeof trpcRouter

import { Layer } from 'effect'
import { DbLive } from './services/Db'
import { CryptoServiceLive } from './services/CryptoService'
import { ConfigServiceLive } from './services/ConfigService'
import { AuthServiceLive } from './services/AuthService'
import { MovieServiceLive } from './services/MovieService'

/** All application services, fully wired. Db + CryptoService also exposed for direct use. */
export const AppLive = Layer.mergeAll(
  ConfigServiceLive,
  AuthServiceLive,
  MovieServiceLive,
).pipe(
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(DbLive),
)

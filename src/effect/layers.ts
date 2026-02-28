import { Layer } from 'effect'
import { DbLive } from './services/Db'
import { CryptoServiceLive } from './services/CryptoService'
import { ConfigServiceLive } from './services/ConfigService'
import { AuthServiceLive } from './services/AuthService'
import { MovieServiceLive } from './services/MovieService'
import { ProfileServiceLive } from './services/ProfileService'
import { ProfileDefaultsEngineLive } from './services/ProfileDefaultsEngine'
import { IndexerServiceLive } from './services/IndexerService'

/** All application services, fully wired. Db + CryptoService also exposed for direct use. */
export const AppLive = Layer.mergeAll(
  ConfigServiceLive,
  AuthServiceLive,
  MovieServiceLive,
  IndexerServiceLive,
).pipe(
  Layer.provideMerge(ProfileDefaultsEngineLive),
  Layer.provideMerge(ProfileServiceLive),
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(DbLive),
)

import { Layer } from "effect"

import { AuthServiceLive } from "./services/AuthService"
import { ConfigServiceLive } from "./services/ConfigService"
import { CryptoServiceLive } from "./services/CryptoService"
import { DbLive } from "./services/Db"
import { DownloadClientServiceLive } from "./services/DownloadClientService"
import { IndexerServiceLive } from "./services/IndexerService"
import { MovieServiceLive } from "./services/MovieService"
import { ProfileDefaultsEngineLive } from "./services/ProfileDefaultsEngine"
import { ProfileServiceLive } from "./services/ProfileService"
import { SeriesServiceLive } from "./services/SeriesService"

/** All application services, fully wired. Db + CryptoService also exposed for direct use. */
export const AppLive = Layer.mergeAll(
  ConfigServiceLive,
  AuthServiceLive,
  MovieServiceLive,
  SeriesServiceLive,
  IndexerServiceLive,
  DownloadClientServiceLive,
).pipe(
  Layer.provideMerge(ProfileDefaultsEngineLive),
  Layer.provideMerge(ProfileServiceLive),
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(DbLive),
)

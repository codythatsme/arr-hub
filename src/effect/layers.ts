import { Layer } from "effect"

import { AcquisitionPipelineLive } from "./services/AcquisitionPipeline"
import { AuthServiceLive } from "./services/AuthService"
import { ConfigServiceLive } from "./services/ConfigService"
import { CryptoServiceLive } from "./services/CryptoService"
import { DbLive } from "./services/Db"
import { DownloadClientServiceLive } from "./services/DownloadClientService"
import { DownloadMonitorLive } from "./services/DownloadMonitor"
import { IndexerServiceLive } from "./services/IndexerService"
import { MediaServerServiceLive } from "./services/MediaServerService"
import { MovieServiceLive } from "./services/MovieService"
import { ProfileDefaultsEngineLive } from "./services/ProfileDefaultsEngine"
import { ProfileServiceLive } from "./services/ProfileService"
import { ReleasePolicyEngineLive } from "./services/ReleasePolicyEngine"
import { SchedulerServiceLive } from "./services/SchedulerService"
import { SeriesServiceLive } from "./services/SeriesService"
import { TitleParserServiceLive } from "./services/TitleParserService"

/** All application services, fully wired. Db + CryptoService also exposed for direct use. */
export const AppLive = Layer.mergeAll(
  AuthServiceLive,
  SchedulerServiceLive,
  AcquisitionPipelineLive,
  DownloadMonitorLive,
).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      MovieServiceLive,
      SeriesServiceLive,
      IndexerServiceLive,
      DownloadClientServiceLive,
      MediaServerServiceLive,
      ReleasePolicyEngineLive,
    ),
  ),
  Layer.provideMerge(TitleParserServiceLive),
  Layer.provideMerge(ProfileDefaultsEngineLive),
  Layer.provideMerge(ConfigServiceLive),
  Layer.provideMerge(ProfileServiceLive),
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(DbLive),
)

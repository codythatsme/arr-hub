import { Layer } from "effect"

import { AcquisitionPipelineLive } from "./services/AcquisitionPipeline"
import { AdapterRegistryLive } from "./services/AdapterRegistry"
import { AuthServiceLive } from "./services/AuthService"
import { ConfigServiceLive } from "./services/ConfigService"
import { CryptoServiceLive } from "./services/CryptoService"
import { DbLive } from "./services/Db"
import { DiagnosticsServiceLive } from "./services/DiagnosticsService"
import { DownloadClientServiceLive } from "./services/DownloadClientService"
import { DownloadMonitorLive } from "./services/DownloadMonitor"
import { ImportServiceLive } from "./services/ImportService"
import { IndexerServiceLive } from "./services/IndexerService"
import { MediaServerServiceLive } from "./services/MediaServerService"
import { MonitoringTriggerBusLive } from "./services/MonitoringTriggerBus"
import { MovieServiceLive } from "./services/MovieService"
import { NotificationServiceLive } from "./services/NotificationService"
import { OnboardingServiceLive } from "./services/OnboardingService"
import { PlexSessionMonitorLive } from "./services/PlexSessionMonitor"
import { PlexUserServiceLive } from "./services/PlexUserService"
import { PluginLoaderLive } from "./services/PluginLoader"
import { ProfileDefaultsEngineLive } from "./services/ProfileDefaultsEngine"
import { ProfileServiceLive } from "./services/ProfileService"
import { QueueServiceLive } from "./services/QueueService"
import { ReleasePolicyEngineLive } from "./services/ReleasePolicyEngine"
import { RootFolderServiceLive } from "./services/RootFolderService"
import { SchedulerServiceLive } from "./services/SchedulerService"
import { SeriesServiceLive } from "./services/SeriesService"
import { SessionHistoryServiceLive } from "./services/SessionHistoryService"
import { SettingsServiceLive } from "./services/SettingsService"
import { StatsServiceLive } from "./services/StatsService"
import { TitleParserServiceLive } from "./services/TitleParserService"
import { TmdbClientLive } from "./services/TmdbClient"

/** All application services, fully wired. Db + CryptoService also exposed for direct use. */
export const AppLive = Layer.mergeAll(
  DiagnosticsServiceLive,
  QueueServiceLive,
  AcquisitionPipelineLive,
  DownloadMonitorLive,
  PlexSessionMonitorLive,
  PluginLoaderLive,
  ImportServiceLive,
).pipe(
  Layer.provideMerge(SchedulerServiceLive),
  Layer.provideMerge(OnboardingServiceLive),
  Layer.provideMerge(AuthServiceLive),
  Layer.provideMerge(
    Layer.mergeAll(
      MovieServiceLive,
      SeriesServiceLive,
      IndexerServiceLive,
      DownloadClientServiceLive,
      MediaServerServiceLive,
      ReleasePolicyEngineLive,
      SessionHistoryServiceLive,
      PlexUserServiceLive,
      StatsServiceLive,
    ),
  ),
  Layer.provideMerge(TitleParserServiceLive),
  Layer.provideMerge(ProfileDefaultsEngineLive),
  Layer.provideMerge(ConfigServiceLive),
  Layer.provideMerge(SettingsServiceLive),
  Layer.provideMerge(NotificationServiceLive),
  Layer.provideMerge(RootFolderServiceLive),
  Layer.provideMerge(ProfileServiceLive),
  Layer.provideMerge(MonitoringTriggerBusLive),
  Layer.provideMerge(AdapterRegistryLive),
  Layer.provideMerge(CryptoServiceLive),
  Layer.provideMerge(TmdbClientLive),
  Layer.provideMerge(DbLive),
)

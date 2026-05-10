import { Layer } from "effect"

import { AcquisitionPipelineLive } from "./services/AcquisitionPipeline"
import { AdapterRegistryLive } from "./services/AdapterRegistry"
import { AuthServiceLive } from "./services/AuthService"
import { BackupServiceLive } from "./services/BackupService"
import { ConfigServiceLive } from "./services/ConfigService"
import { CryptoServiceLive } from "./services/CryptoService"
import { DbLive } from "./services/Db"
import { DiagnosticsServiceLive } from "./services/DiagnosticsService"
import { DownloadClientServiceLive } from "./services/DownloadClientService"
import { DownloadHistoryServiceLive } from "./services/DownloadHistoryService"
import { DownloadMonitorLive } from "./services/DownloadMonitor"
import { ImportServiceLive } from "./services/ImportService"
import { IndexerApplicationServiceLive } from "./services/IndexerApplicationService"
import { IndexerDefinitionSourceServiceLive } from "./services/IndexerDefinitionSourceService"
import { IndexerServiceLive } from "./services/IndexerService"
import { MaintenanceServiceLive } from "./services/MaintenanceService"
import { MediaImportServiceLive } from "./services/MediaImportService"
import { MediaServerServiceLive } from "./services/MediaServerService"
import { MetadataRefreshServiceLive } from "./services/MetadataRefreshService"
import { MonitoringTriggerBusLive } from "./services/MonitoringTriggerBus"
import { MovieServiceLive } from "./services/MovieService"
import { NotificationServiceLive } from "./services/NotificationService"
import { OnboardingServiceLive } from "./services/OnboardingService"
import { OperationalHistoryServiceLive } from "./services/OperationalHistoryService"
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
import type { TmdbClient } from "./services/TmdbClient"

const DownloadMonitorWithImportLive = DownloadMonitorLive.pipe(
  Layer.provideMerge(MediaImportServiceLive),
)

/** All application services, fully wired. Db + CryptoService also exposed for direct use. */
export function makeAppLayer(tmdbClientLayer: Layer.Layer<TmdbClient> = TmdbClientLive) {
  return Layer.mergeAll(
    DiagnosticsServiceLive,
    BackupServiceLive,
    MaintenanceServiceLive,
    QueueServiceLive,
    AcquisitionPipelineLive,
    DownloadMonitorWithImportLive,
    PlexSessionMonitorLive,
    PluginLoaderLive,
    MetadataRefreshServiceLive,
    ImportServiceLive,
    IndexerApplicationServiceLive,
    IndexerDefinitionSourceServiceLive,
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
        DownloadHistoryServiceLive,
        MediaServerServiceLive,
        ReleasePolicyEngineLive,
        SessionHistoryServiceLive,
        OperationalHistoryServiceLive,
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
    Layer.provideMerge(tmdbClientLayer),
    Layer.provideMerge(DbLive),
  )
}

export const AppLive = makeAppLayer()

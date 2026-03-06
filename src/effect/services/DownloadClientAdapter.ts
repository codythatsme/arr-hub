import type { Effect } from "effect"

import type {
  AddDownloadOptions,
  DownloadClientHealth,
  DownloadStatus,
} from "../domain/downloadClient"
import type { DownloadClientError } from "../errors"

// ── Interface ──

export interface DownloadClientAdapter {
  readonly testConnection: () => Effect.Effect<DownloadClientHealth, DownloadClientError>
  readonly addDownload: (
    url: string,
    options?: AddDownloadOptions,
  ) => Effect.Effect<string, DownloadClientError>
  readonly getQueue: () => Effect.Effect<ReadonlyArray<DownloadStatus>, DownloadClientError>
  readonly removeDownload: (
    externalId: string,
    deleteFiles: boolean,
  ) => Effect.Effect<void, DownloadClientError>
  readonly getHealth: () => Effect.Effect<DownloadClientHealth, DownloadClientError>
}

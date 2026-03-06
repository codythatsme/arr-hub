import type { Effect } from "effect"

import type { IndexerCapabilities, ReleaseCandidate, SearchQuery } from "../domain/indexer"
import type { IndexerError } from "../errors"

// ── Interface ──

export interface IndexerAdapter {
  readonly testConnection: () => Effect.Effect<IndexerCapabilities, IndexerError>
  readonly search: (
    query: SearchQuery,
  ) => Effect.Effect<ReadonlyArray<ReleaseCandidate>, IndexerError>
}

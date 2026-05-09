import { Effect } from "effect"

import { IndexerApplicationService } from "#/effect/services/IndexerApplicationService"

export const syncEnabledIndexerApplications = Effect.gen(function* () {
  const apps = yield* IndexerApplicationService
  yield* apps.syncEnabled().pipe(Effect.ignore)
})

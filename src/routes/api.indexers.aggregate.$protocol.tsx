import { SqlError } from "@effect/sql/SqlError"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"

import { AuthError } from "#/effect/errors"
import { AppRuntime } from "#/effect/runtime"
import { AuthService } from "#/effect/services/AuthService"
import { IndexerService } from "#/effect/services/IndexerService"
import {
  buildCapsXml,
  buildReleaseFeedXml,
  buildTorznabErrorXml,
  parseAggregateIndexerRequest,
  protocolFromPath,
  xmlResponse,
  type AggregateProtocolPath,
} from "#/lib/torznab"

async function handler({ request }: { request: Request }) {
  const url = new URL(request.url)
  const protocolPath = url.pathname.split("/").at(-1) as AggregateProtocolPath | undefined
  const protocol = protocolFromPath(protocolPath)
  if (!protocol || !protocolPath) {
    return xmlResponse(buildTorznabErrorXml(203, "unsupported aggregate indexer protocol"), 400)
  }

  const apiKey = url.searchParams.get("apikey")
  if (!apiKey) {
    return xmlResponse(buildTorznabErrorXml(100, "missing API key"), 401)
  }

  const parsed = parseAggregateIndexerRequest(url, protocol)
  if (!parsed.ok) {
    return xmlResponse(buildTorznabErrorXml(201, parsed.error), 400)
  }

  try {
    const body = await AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        yield* auth.validateToken(apiKey)

        const indexers = yield* IndexerService
        if (parsed.request.kind === "caps") {
          const caps = yield* indexers.aggregateCapabilities(protocol)
          return buildCapsXml(caps, protocol)
        }

        const result = yield* indexers.search(parsed.request.query)
        return buildReleaseFeedXml(result.releases, protocolPath)
      }),
    )
    return xmlResponse(body)
  } catch (error) {
    if (error instanceof AuthError) {
      return xmlResponse(buildTorznabErrorXml(100, error.reason), 401)
    }
    if (error instanceof SqlError) {
      return xmlResponse(buildTorznabErrorXml(500, "database error"), 500)
    }
    return xmlResponse(buildTorznabErrorXml(500, "unexpected error"), 500)
  }
}

export const Route = createFileRoute("/api/indexers/aggregate/$protocol")({
  server: { handlers: { GET: handler } },
})

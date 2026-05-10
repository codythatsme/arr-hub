import { ValidationError } from "#/effect/errors"

export interface CompatibleEpisodeMonitorInput {
  readonly monitored: boolean
}

export function episodeMonitorInputFromBody(
  body: unknown,
): CompatibleEpisodeMonitorInput | ValidationError {
  const input = objectFromUnknown(body)
  if (!input) return new ValidationError({ message: "episode body must be an object" })

  const monitored = input.monitored
  if (typeof monitored !== "boolean") {
    return new ValidationError({ message: "monitored must be a boolean" })
  }

  return { monitored }
}

function objectFromUnknown(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

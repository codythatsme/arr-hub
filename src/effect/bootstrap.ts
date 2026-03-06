const DEFAULT_DEV_ADMIN_PASSWORD = "admin"

let hasWarnedDevAdminFallback = false

export function resolveInitialAdminPassword(env: NodeJS.ProcessEnv): string {
  const configured = env.INITIAL_ADMIN_PASSWORD?.trim()
  if (configured) return configured

  if (env.NODE_ENV === "production") {
    throw new Error("INITIAL_ADMIN_PASSWORD is required in production for first-run bootstrap")
  }

  if (!hasWarnedDevAdminFallback) {
    // eslint-disable-next-line no-console -- one-time startup warning for local development
    console.warn(
      "[arr-hub] INITIAL_ADMIN_PASSWORD not set — using insecure dev fallback password 'admin'",
    )
    hasWarnedDevAdminFallback = true
  }

  return DEFAULT_DEV_ADMIN_PASSWORD
}

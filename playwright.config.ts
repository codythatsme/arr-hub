import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  webServer: {
    command: "bun run e2e:serve",
    env: {
      ARR_HUB_E2E_FIXTURES: "1",
      DATABASE_PATH: ".tmp/e2e/arr-hub.db",
      PORT: "3100",
      TMDB_API_KEY: "e2e-fixture",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:3100/onboarding",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})

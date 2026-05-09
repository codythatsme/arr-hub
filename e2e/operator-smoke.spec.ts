import { expect, test } from "@playwright/test"

test("operator UI smoke covers onboarding, settings, movies, TV, manual search, and queue", async ({
  page,
}) => {
  await page.goto("/onboarding")
  await expect(page.getByRole("heading", { name: "Welcome to arr-hub" })).toBeVisible()

  await page.getByRole("link", { name: "Start" }).click()
  await expect(page.getByRole("heading", { name: "Quickstart" })).toBeVisible()
  await page.waitForLoadState("networkidle")
  await page.getByLabel("Password").fill("password123")
  await page.getByLabel("Movies root folder").fill("/tmp/arr-hub-e2e/movies")
  await page.getByLabel("TV root folder").fill("/tmp/arr-hub-e2e/tv")
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()

  const assertSettingsPage = async (path: string, heading: string) => {
    await page.goto(path)
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible()
  }
  await assertSettingsPage("/settings/indexers", "Indexers")
  await assertSettingsPage("/settings/download-clients", "Download Clients")
  await assertSettingsPage("/settings/media-servers", "Media Servers")
  await assertSettingsPage("/settings/scheduler", "Scheduler")
  await assertSettingsPage("/settings/general", "General")
  await assertSettingsPage("/settings/media-management", "Media Management")
  await assertSettingsPage("/settings/profiles", "Profiles")

  await page.goto("/movies")
  await expect(page.getByRole("heading", { name: "Movies" })).toBeVisible()
  await page.waitForLoadState("networkidle")
  await page.getByLabel("TMDB search").fill("fixture")
  await expect(page.getByRole("button", { name: "Search" })).toBeEnabled()
  await page.getByRole("button", { name: "Search" }).click()
  await expect(page.getByRole("heading", { name: /E2E Fixture Movie/ })).toBeVisible()
  await page.getByLabel("Quality profile").selectOption({ index: 1 })
  await page.getByLabel("Root folder").selectOption({ index: 1 })
  await page.getByRole("button", { name: "Add" }).click()
  await expect(page.getByText(/Added E2E Fixture Movie/)).toBeVisible()
  const movieHref = await page.getByRole("link", { name: /E2E Fixture Movie/ }).getAttribute("href")
  expect(movieHref).toBeTruthy()
  await page.goto(movieHref!)
  await expect(page.getByRole("heading", { name: /E2E Fixture Movie/ })).toBeVisible()
  await page.waitForLoadState("networkidle")
  await expect(page.getByRole("button", { name: "Search" })).toBeEnabled()
  await page.getByRole("button", { name: "Search" }).click()
  await expect(page.getByText("Manual search returned 0 releases.")).toBeVisible()

  await page.goto("/tv")
  await expect(page.getByRole("heading", { name: "TV Shows" })).toBeVisible()
  await page.waitForLoadState("networkidle")
  const metadataSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Add From Metadata" }),
  })
  await metadataSection.getByLabel("TMDB series search").fill("fixture")
  await expect(metadataSection.getByRole("button", { name: "Add", exact: true })).toBeVisible()
  await metadataSection.getByLabel("Metadata profile").selectOption({ index: 1 })
  await metadataSection.getByLabel("Metadata root").selectOption({ index: 2 })
  await metadataSection.getByRole("button", { name: "Add", exact: true }).click()
  await expect(page.getByText("Added E2E Fixture Series.")).toBeVisible()
  const seriesHref = await page
    .getByRole("link", { name: /E2E Fixture Series/ })
    .getAttribute("href")
  expect(seriesHref).toBeTruthy()
  await page.goto(seriesHref!)
  await expect(page.getByRole("heading", { name: /E2E Fixture Series/ })).toBeVisible()
  await page.waitForLoadState("networkidle")
  await page
    .locator("label")
    .filter({ hasText: "Episode" })
    .getByRole("button", { name: "Search" })
    .click()
  await expect(page.getByText("Manual search returned 0 releases.")).toBeVisible()

  await page.goto("/activity/queue")
  await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible()
  await expect(page.getByText("No active downloads.")).toBeVisible()
})

import { expect, test } from "@playwright/test"

// In-app updates (v0.14.0, owner: "an update button, that downloads the new
// appimage, and restarts the app"; policy: manual only). The browser has no
// Tauri updater, so `pg.updateMock` swaps in the mock backend: a newer
// version, simulated download progress, and a recorded relaunch. The real
// path (signed manifest on the GitHub release) is only provable with the
// release after this one.

test("without the desktop shell, Settings says where updates come from", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("settings-button").click()
  await expect(page.getByTestId("updates-none")).toContainText("Updates come with the desktop app")
  await expect(page.getByTestId("update-check")).toHaveCount(0)
})

test("check for updates, download with progress, restart", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("pg.updateMock", "1"))
  await page.goto("/")
  await page.getByTestId("settings-button").click()
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  // The version is the Updates row's title.
  await expect(page.getByTestId("settings-section-updates").getByText(/^PowerGit v\d+\.\d+\.\d+$/)).toBeVisible()

  // Nothing happens on its own: no update text before the button.
  await expect(page.getByTestId("update-available")).toHaveCount(0)

  await page.getByTestId("update-check").click()
  await expect(page.getByTestId("update-available")).toContainText("PowerGit v9.9.9 is available")
  await expect(page.getByText("PowerGit closes, installs v9.9.9 and reopens.")).toBeVisible()

  await page.getByTestId("update-install").click()
  await expect(page.getByTestId("update-progress")).toBeVisible()
  await expect(page.getByTestId("update-progress")).toContainText(/Downloading \d+\.\d MB of 4\.0 MB/)
  await expect(page.getByTestId("update-ready")).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem("pg.updateMock.relaunched"))).toBe("1")
})

test("up to date is reported inline", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("pg.updateMock", "uptodate"))
  await page.goto("/")
  await page.getByTestId("settings-button").click()
  await page.getByTestId("update-check").click()
  await expect(page.getByTestId("update-uptodate")).toContainText("You are up to date")
})

test("a failed check is reported inline with Retry", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("pg.updateMock", "error"))
  await page.goto("/")
  await page.getByTestId("settings-button").click()
  await page.getByTestId("update-check").click()
  await expect(page.getByTestId("update-error")).toContainText("Could not reach github.com")
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible()
})

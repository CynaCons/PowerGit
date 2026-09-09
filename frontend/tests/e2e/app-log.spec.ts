import { expect, test } from "@playwright/test"

// Owner, 2026-09-09 (Ubuntu AppImage): "the fix in 0.15.2 to show the debugger
// panel did not work. Give me a 15.3 very quickly with a button in the
// settings to open that drawer." The WebKitGTK inspector would not open, so
// the app has to show its own console. This asserts the path the owner takes:
// Settings → Open app log → the console panel, on the app tab, with entries.

test("Settings opens the app log, which shows what the console recorded", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("status-branch")).toHaveText("powergit", { timeout: 30_000 })

  // Something only a console call could have put there.
  await page.evaluate(() => console.warn("owner smoke", { from: "app-log.spec" }))

  await page.keyboard.press("Control+Comma")
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.getByTestId("open-app-log").click()

  // The button closes Settings and leaves the panel open on the app tab.
  await expect(page.getByRole("dialog")).toHaveCount(0)
  const panel = page.getByTestId("git-console-panel")
  await expect(panel).toBeVisible()
  await expect(page.getByTestId("console-tab-app")).toHaveAttribute("aria-pressed", "true")

  const entries = page.getByTestId("app-log-entry")
  await expect(entries.filter({ hasText: "owner smoke" })).toHaveCount(1)
  await expect(entries.filter({ hasText: "owner smoke" })).toHaveAttribute("data-level", "warn")
})

test("the app log filters, and the git tab keeps its own filter", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("status-branch")).toHaveText("powergit", { timeout: 30_000 })
  await page.evaluate(() => {
    console.info("alpha entry")
    console.error("beta failure")
  })

  await page.keyboard.press("Control+`")
  await expect(page.getByTestId("git-console-panel")).toBeVisible()

  // A filter typed on the git tab must not follow us to the app tab: "fatal"
  // means something there and nothing here.
  await page.getByTestId("git-console-filter").fill("fatal")
  await page.getByTestId("console-tab-app").click()
  await expect(page.getByTestId("git-console-filter")).toHaveValue("")

  const entries = page.getByTestId("app-log-entry")
  await expect(entries.filter({ hasText: "alpha entry" })).toHaveCount(1)
  await page.getByTestId("git-console-filter").fill("beta")
  await expect(entries.filter({ hasText: "alpha entry" })).toHaveCount(0)
  await expect(entries.filter({ hasText: "beta failure" })).toHaveCount(1)

  await page.getByTestId("console-tab-git").click()
  await expect(page.getByTestId("git-console-filter")).toHaveValue("fatal")
})

test("Ctrl+Shift+backtick opens the panel straight onto the app log", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("status-branch")).toHaveText("powergit", { timeout: 30_000 })
  await expect(page.getByTestId("git-console")).toHaveAttribute("data-open", "false")

  await page.keyboard.press("Control+Shift+`")

  await expect(page.getByTestId("git-console-panel")).toBeVisible()
  await expect(page.getByTestId("console-tab-app")).toHaveAttribute("aria-pressed", "true")
})

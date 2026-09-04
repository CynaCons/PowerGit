import { expect, test } from "@playwright/test"

// Covers audit item 3 (docs/agents/memories -> owner audit, section B.2):
// the error banner used to be a plain caption that never went away. It is
// now a dismissable MUI Alert with a "Copy" action.
test("error banner is dismissable and copies its text to the clipboard", async ({ page, context }) => {
  // WebKit has no clipboard-read permission in Playwright (grantPermissions
  // throws), and WebKitGTK may not expose navigator.clipboard under tauri://
  // at all — which is why the Copy button falls back to execCommand. There the
  // copy click is still exercised, only the read-back is skipped.
  const canReadClipboard = test.info().project.name !== "webkit"
  if (canReadClipboard) {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
  }
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible()

  // Force a real, withBusy-routed failure instead of relying on repo state
  // (e.g. "no remote configured") that could vary by checkout.
  await page.route("**/fetch", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "synthetic fetch failure" }),
    }),
  )
  await page.getByTestId("fetch-button").click()

  const banner = page.getByTestId("error-banner")
  await expect(banner).toBeVisible()
  await expect(banner).toContainText("synthetic fetch failure")

  await page.getByTestId("error-banner-copy").click()
  if (canReadClipboard) {
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("synthetic fetch failure")
  } else {
    // The click must not tear the banner down or throw into the page.
    await expect(banner).toContainText("synthetic fetch failure")
  }

  await page.getByTestId("error-banner-close").click()
  await expect(banner).toBeHidden()
})

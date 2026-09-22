import { expect, test } from "@playwright/test"

// Owner (Ubuntu AppImage, 2026-09-09): '"open recent repos" only work until i close the app,
// then its gone when i close reopen.' Model a restarted engine: saved recents, no open session.
test("saved recent repositories appear after reopening with no active repository", async ({ page }) => {
  await page.route("**/health", (route) =>
    route.fulfill({ json: { status: "ok", engine: "0.15.2", gitPath: "git", gitVersion: "git version 2.43.0" } }),
  )
  await page.route("**/repos/current", (route) => route.fulfill({ status: 404 }))
  // The saved root is gone: automatic reopen must fall through to empty Browse.
  await page.route("**/repos/open", (route) => route.fulfill({ status: 404 }))
  await page.route("**/repos/recents", (route) =>
    route.fulfill({ json: [{ id: "saved", name: "My Ubuntu project", root: "/home/me/project", branch: "main" }] }),
  )
  // With no repository open the start pane is the front door (v0.20.3), so
  // the saved list is on screen without a click.
  await page.goto("/")
  await expect(page.getByTestId("start-row")).toContainText("My Ubuntu project")
  await page.reload()
  await expect(page.getByTestId("start-row")).toContainText("My Ubuntu project")
})

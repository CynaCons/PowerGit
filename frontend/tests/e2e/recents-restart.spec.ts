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
  // The pane reads repositories with their worktrees (v0.20.10); the same
  // saved repository, as the restarted engine would answer it.
  await page.route("**/repos/workspaces", (route) =>
    route.fulfill({
      json: [
        {
          name: "My Ubuntu project",
          mainRoot: "/home/me/project",
          lastOpened: null,
          pinned: false,
          worktrees: [
            {
              root: "/home/me/project",
              name: "My Ubuntu project",
              branch: "main",
              main: true,
              detached: false,
              lastOpened: "2026-09-09T10:00:00Z",
              pinned: false,
              id: "saved",
            },
          ],
        },
      ],
    }),
  )
  // With no repository open the start pane is the front door (v0.20.3), so
  // the saved list is on screen without a click.
  await page.goto("/")
  await expect(page.getByTestId("start-row")).toContainText("My Ubuntu project")
  await page.reload()
  await expect(page.getByTestId("start-row")).toContainText("My Ubuntu project")
})

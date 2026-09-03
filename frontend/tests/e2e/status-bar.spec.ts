import { expect, test } from "@playwright/test"

import { ENGINE_URL, engineHeaders } from "../engine"

// Covers audit item 9 (section B): the status strip shows repo state (branch,
// ahead/behind, dirty count) instead of just engine health. Fetches the
// branch/status straight from the engine instead of hardcoding a branch name
// — see docs/agents/memories/engine-exe-lock.md: TryDiscover exposes
// whatever is actually checked out.
test("status bar shows the branch in bold, ahead/behind when tracked, dirty count, and a muted engine version", async ({ page }) => {
  const [repo, status] = await Promise.all([
    fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() }).then((r) => r.json() as Promise<{ branch: string }>),
    fetch(`${ENGINE_URL}/status`, { headers: engineHeaders() }).then(
      (r) => r.json() as Promise<{ ahead: number | null; behind: number | null; unstagedCount: number; stagedCount: number }>,
    ),
  ])

  await page.goto("/")
  const bar = page.getByTestId("engine-status")
  await expect(bar).toBeVisible()
  // The dirty count is always parenthesized once a repo is live (see
  // App.tsx), so "(" also doubles as the "real data loaded" signal other
  // specs (shell.spec.ts, perf.spec.ts, heavy.spec.ts) rely on.
  await expect(bar).toContainText("(", { timeout: 30_000 })

  const branchLabel = bar.getByText(repo.branch, { exact: true })
  await expect(branchLabel).toBeVisible()
  const weight = await branchLabel.evaluate((el) => Number(getComputedStyle(el).fontWeight))
  expect(weight).toBeGreaterThanOrEqual(600)

  if (status.ahead !== null && status.behind !== null) {
    await expect(bar).toContainText(`↑${status.ahead} ↓${status.behind}`)
  }

  const dirty = status.unstagedCount + status.stagedCount
  await expect(bar).toContainText(`(${dirty} change`)
  await expect(bar).toContainText("engine")
})

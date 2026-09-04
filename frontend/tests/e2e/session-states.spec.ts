import { expect, test } from "@playwright/test"
import { ENGINE_URL, engineHeaders, repoBase } from "../engine"

// v0.13.12 task 7: the session phases are real, distinct UI states driven by
// the state machine — startup, ready, background refresh, engine lost and
// recovered, unknown repository, and pinned repositories per window.

test("boot goes through starting into ready and never shows sample data", async ({ page }) => {
  // Hold /health for a moment so the "starting" phase is observable.
  let release: () => void = () => {}
  const gate = new Promise<void>((r) => (release = r))
  let first = true
  await page.route("**/health", async (route) => {
    if (first) {
      first = false
      await gate
    }
    await route.continue()
  })
  await page.goto("/")
  const bar = page.getByTestId("engine-status")
  await expect(bar).toHaveAttribute("data-phase", "starting")
  await expect(page.getByTestId("grid-starting")).toBeVisible()
  release()
  await expect(bar).toHaveAttribute("data-phase", "live", { timeout: 30_000 })
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
  await expect(bar).toContainText("(")
})

test("losing the engine keeps the last graph, shows recovering, and comes back", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
  const rowsBefore = await page.getByTestId("grid-row").count()

  // Every engine request fails at the transport level: that is "engine lost".
  await page.route(`${ENGINE_URL}/**`, (route) => route.abort("connectionrefused"))

  const bar = page.getByTestId("engine-status")
  // A background request can hit the route first and move the session into
  // recovery, which correctly disables Refresh before Playwright dispatches
  // its click. Try the explicit trigger briefly, then assert the state change
  // caused by either request instead of racing the disabled button.
  await page
    .getByTestId("refresh-button")
    .click({ timeout: 2_000 })
    .catch(() => undefined)
  await expect(bar).toHaveAttribute("data-phase", "offline", { timeout: 10_000 })
  await expect(page.getByTestId("status-session")).toContainText(/reconnecting/i)
  // The last valid data stays on screen instead of being replaced by samples.
  // (virtualized: the exact count drifts by a row with layout; presence is the point)
  expect(await page.getByTestId("grid-row").count()).toBeGreaterThan(Math.min(rowsBefore, 5) - 1)

  // The recovery panel names the phase and offers Retry.
  await page.getByTestId("status-session").click()
  const panel = page.getByTestId("recovery-panel")
  await expect(panel).toBeVisible()
  await expect(panel).toContainText(/engine unreachable/i)
  await expect(page.getByTestId("recovery-diagnostics")).toContainText(/unreachable/i)

  await page.unroute(`${ENGINE_URL}/**`)
  await page.getByTestId("recovery-retry").click()
  await expect(bar).toHaveAttribute("data-phase", "live", { timeout: 30_000 })
  await expect(page.getByTestId("status-branch")).toBeVisible()
})

test("an evicted session drops to no-repository with a reason and a way out", async ({ page }) => {
  const base = await repoBase()
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })

  await page.route(`${base}/status`, (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "unknown repository session 'x'" }),
    }),
  )
  await page.getByTestId("refresh-button").click()
  const bar = page.getByTestId("engine-status")
  await expect(bar).toHaveAttribute("data-phase", "no-repository", { timeout: 10_000 })
  await expect(page.getByTestId("status-session")).toContainText(/no longer has this repository/i)
  await expect(page.getByTestId("grid-open-repo")).toBeVisible()
  await page.unroute(`${base}/status`)
})

test("two windows pinned to different repositories do not switch each other", async ({ browser }) => {
  // A second repository on the engine: a throwaway clone of the current one.
  const base = await repoBase()
  const current = (await (await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })).json()) as {
    id: string
    root: string
    branch: string
  }
  const fs = await import("node:fs")
  const os = await import("node:os")
  const path = await import("node:path")
  const { execFileSync } = await import("node:child_process")
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-iso-"))
  execFileSync("git", ["init", "-q", "-b", "isolated-branch", dir])
  execFileSync("git", [
    "-C",
    dir,
    "-c",
    "user.email=t@t",
    "-c",
    "user.name=t",
    "commit",
    "--allow-empty",
    "-qm",
    "isolated commit",
  ])
  const opened = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: engineHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path: dir }),
  })
  const other = (await opened.json()) as { id: string }
  expect(other.id).not.toBe(current.id)

  try {
    const a = await browser.newPage()
    const b = await browser.newPage()
    await a.goto(`/?repo=${current.id}`)
    await b.goto(`/?repo=${other.id}`)
    await expect(a.getByTestId("status-branch")).toHaveText(current.branch, { timeout: 30_000 })
    await expect(b.getByTestId("status-branch")).toHaveText("isolated-branch", { timeout: 30_000 })
    // The engine-global "current" is now the isolated repo, yet window A
    // still shows its own after a reload because the pin survives.
    await a.reload()
    await expect(a.getByTestId("status-branch")).toHaveText(current.branch, { timeout: 30_000 })
    expect(a.url()).toContain(`repo=${current.id}`)
    await a.close()
    await b.close()
  } finally {
    // Restore the engine's current repo for the specs that follow.
    await fetch(`${ENGINE_URL}/repos/${other.id}`, { method: "DELETE", headers: engineHeaders() })
    await fetch(`${ENGINE_URL}/repos/open`, {
      method: "POST",
      headers: engineHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path: current.root }),
    })
    expect(await (await fetch(`${base}/status`, { headers: engineHeaders() })).status).toBe(200)
    // Windows can retain a just-disposed FileSystemWatcher handle briefly.
    // Match the engine lifecycle fixture's bounded cleanup tolerance.
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 40, retryDelay: 250 })
  }
})

test("pull and push previews state branch, upstream and ahead/behind before running", async ({ page }) => {
  const base = await repoBase()
  const status = (await (await fetch(`${base}/status`, { headers: engineHeaders() })).json()) as {
    branch: string
    upstream: string | null
    ahead: number | null
    behind: number | null
  }
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })

  await page.getByTestId("pull-button").click()
  const pull = page.getByTestId("pull-preview")
  await expect(pull).toBeVisible()
  await expect(page.getByTestId("preview-branch")).toHaveText(status.branch)
  if (status.upstream) await expect(page.getByTestId("preview-upstream")).toHaveText(status.upstream)
  if (status.ahead !== null && status.behind !== null) {
    await expect(page.getByTestId("preview-ahead-behind")).toHaveText(`↑${status.ahead} ↓${status.behind}`)
  }
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(pull).toBeHidden()

  // Force-with-lease demands the branch name typed back.
  await page.getByTestId("push-button-menu").click()
  await page.getByTestId("push-force-lease").click()
  await expect(page.getByTestId("push-force-preview")).toBeVisible()
  await expect(page.getByTestId("preview-confirm")).toBeDisabled()
  await page.getByTestId("preview-force-confirm").fill(status.branch)
  await expect(page.getByTestId("preview-confirm")).toBeEnabled()
  await page.getByRole("button", { name: "Cancel" }).click()
})

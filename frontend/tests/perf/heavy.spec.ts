import { expect, test } from "@playwright/test"

// Perf budgets against the synthetic heavy repo (50k commits, 2500+ refs).
// Run via `npm run test:perf` — the orchestrator starts the engine with the
// heavy repo open and passes its manifest in PERF_MANIFEST.
//
// These budgets encode the v0.8.0 owner complaints: the shell must render
// immediately, the first page of a huge history must arrive in seconds, every
// branch must be findable, and jumping to a deep branch tip must load history
// until it is visible instead of silently doing nothing.

const manifest = JSON.parse(process.env.PERF_MANIFEST ?? "{}") as {
  root: string
  commits: number
  deepTipSha: string
  headSha: string
}

test("first page of a 50k-commit history renders within budget", async ({ page }) => {
  const t0 = Date.now()
  await page.goto("/")
  await expect(page.getByTestId("browse-shell")).toBeVisible({ timeout: 5_000 })
  await expect(page.getByTestId("engine-status")).toContainText("(", { timeout: 15_000 })
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 15_000 })
  const firstPaint = Date.now() - t0
  expect(firstPaint, `first rows took ${firstPaint}ms`).toBeLessThan(15_000)

  // Background autofill keeps appending pages: total scroll height must grow
  // well past the first page without any interaction.
  const height = () => page.getByTestId("grid-body").evaluate((el) => el.firstElementChild!.scrollHeight)
  await expect.poll(height, { timeout: 60_000 }).toBeGreaterThan(1_500 * 28)
})

test("row selection stays fast while thousands of rows are loaded", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 15_000 })

  await page.getByTestId("grid-body").evaluate((el) => {
    el.scrollTop = el.scrollHeight / 3
  })
  const target = page.getByTestId("grid-row").nth(4)
  await expect(target).toBeVisible()
  const dataIndex = await target.getAttribute("data-index")
  const t0 = Date.now()
  await target.click()
  await expect(page.locator(`[data-testid="grid-row"][data-index="${dataIndex}"]`)).toHaveClass(/selected/, {
    timeout: 2_000,
  })
  expect(Date.now() - t0, "selection latency").toBeLessThan(1_500)
})

test("filter finds one branch among thousands, jump loads history to its tip", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 15_000 })

  // Findability: a substring narrows thousands of refs in well under a second.
  const filter = page.getByTestId("tree-filter")
  const t0 = Date.now()
  await filter.fill("deep-tip")
  const match = page.locator('[data-testid="tree-row"][data-label*="deep-tip"]')
  await expect(match.first()).toBeVisible({ timeout: 2_000 })
  expect(Date.now() - t0, "filter latency").toBeLessThan(2_000)

  // Jump: the tip is tens of thousands of commits deep — clicking must keep
  // loading pages until the commit is in the graph, then select + scroll.
  await match.first().click()
  const selectedSha = page.locator(".grid-row.selected [data-testid='sha-cell']")
  await expect(selectedSha).toHaveText(manifest.deepTipSha.slice(0, 7), { timeout: 90_000 })
})

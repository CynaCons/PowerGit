import { expect, test } from "@playwright/test"
import { PAGE_INSTRUMENTATION } from "../../scripts/perf/metrics.mjs"

// Pending-changes budgets (v0.18.10 perf audit): the generated tree with
// 2,000 modified, 500 untracked and 200 staged files
// (scripts/perf/make-pending.mjs), opened on the perf engine (:7799) beside
// the heavy repo. Budgets are the 2026-09-16 measurements (Vite dev build)
// × 1.5 — docs/perf/audit-2026-09-16.md — so a regression fails; nothing
// here implies a fix. Run via `npm run test:perf`.

const ENGINE_URL = "http://127.0.0.1:7799"
const N = 2000
const BUDGET = {
  wdRowMs: 6_000, // boot → "Working directory (2,500 files)"; measured ~3.5 s
  diffFileListMs: 4_500, // click the row + Diff tab → 2,500 file rows; measured ~3 s
  commitWindowListsMs: 6_000, // Ctrl+Space → both lists rendered; measured ~4 s
}

const headers = () => ({ Authorization: `Bearer ${process.env.VITE_ENGINE_TOKEN ?? ""}` })

let repoId = ""
let heavyRoot = ""

test.beforeAll(async () => {
  const { ensurePendingRepo } = await import("../../../scripts/perf/make-pending.mjs")
  const manifest = await ensurePendingRepo({ n: N })
  heavyRoot = JSON.parse(process.env.PERF_MANIFEST ?? "{}").root ?? ""
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ path: manifest.root }),
  })
  expect(res.ok, `open pending repo: ${res.status}`).toBe(true)
  repoId = ((await res.json()) as { id: string }).id
})

test.afterAll(async () => {
  // Back to the heavy repo as the engine's current one for the specs after this.
  if (heavyRoot) {
    await fetch(`${ENGINE_URL}/repos/open`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ path: heavyRoot }),
    }).catch(() => undefined)
  }
})

test("the Working directory row, the Diff tab and the commit window open within budget at 2,000 pending files", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.addInitScript(PAGE_INSTRUMENTATION)
  const t0 = Date.now()
  await page.goto(`/?repo=${repoId}`)
  const wd = page
    .getByTestId("grid-row")
    .filter({ hasText: /Working directory \(/ })
    .first()
  await expect(wd).toBeVisible({ timeout: 60_000 })
  const wdRowMs = Date.now() - t0
  await expect(wd).toContainText(`(${(N + N / 4).toLocaleString("en-US")} files)`)
  expect(wdRowMs, `Working directory row after ${wdRowMs} ms`).toBeLessThan(BUDGET.wdRowMs)

  const t1 = Date.now()
  await wd.click()
  await page.getByRole("tab", { name: /^Diff/ }).click()
  await expect(page.getByTestId("file-list-row").first()).toBeVisible({ timeout: 60_000 })
  const diffFileListMs = Date.now() - t1
  expect(diffFileListMs, `Diff tab file list after ${diffFileListMs} ms`).toBeLessThan(BUDGET.diffFileListMs)

  const t2 = Date.now()
  await page.getByTestId("commit-button").click()
  await expect(page.getByTestId("commit-message-input")).toBeVisible({ timeout: 60_000 })
  await expect
    .poll(() => page.getByTestId("unstaged-list-row").count(), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(N + N / 4)
  const commitWindowListsMs = Date.now() - t2
  expect(commitWindowListsMs, `commit window lists after ${commitWindowListsMs} ms`).toBeLessThan(
    BUDGET.commitWindowListsMs,
  )
})

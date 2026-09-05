import { expect, test } from "@playwright/test"

// Owner question, 2026-09-05: "Can we make the diff loading faster?"
// Measures, in-page, the time from a click on a row until (a) the row is
// highlighted, (b) the Diff tab's file list shows the new commit's files and
// (c) the diff of its first file is on screen. The numbers are attached to
// the test report (annotations) so a change can be judged against them.
// Budgets are for the Vite dev build the suite runs against; production is
// faster. Tighten them when the pipeline gets faster, never loosen them.

type Sample = { row: number; toClass: number; toFiles: number; toDiff: number }

test("click → diff on screen latency", async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto("/")
  const rows = page.getByTestId("grid-row")
  await expect(rows.nth(12)).toBeVisible({ timeout: 30_000 })
  // Steady state only: while a long history is still streaming in, the
  // layout worker's page appends own the main thread for 150-400 ms at a
  // time and would dominate the numbers (that cost is tracked separately).
  await expect
    .poll(
      async () => {
        const grid = page.getByTestId("grid-body")
        const before = await grid.evaluate((el) => el.scrollHeight)
        await new Promise((r) => setTimeout(r, 500))
        return before === (await grid.evaluate((el) => el.scrollHeight))
      },
      { timeout: 60_000, message: "history kept growing for 60 s" },
    )
    .toBe(true)
  await page.getByRole("tab", { name: /^Diff/ }).click()
  await rows.nth(1).click()
  await expect(page.getByTestId("diff-view")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId("diff-loading")).toHaveCount(0, { timeout: 15_000 })

  const samples: Sample[] = []
  for (const row of [3, 5, 7, 9, 11]) {
    const sample = await rows.nth(row).evaluate(async (el, row) => {
      const q = (id: string) => document.querySelector(`[data-testid="${id}"]`)
      const filesText = () => q("file-list")?.textContent ?? ""
      const diffText = () => q("diff-lines")?.textContent ?? ""
      const filesBefore = filesText()
      const diffBefore = diffText()
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
      const t0 = performance.now()
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
      let toClass = -1
      let toFiles = -1
      let toDiff = -1
      while (performance.now() - t0 < 10_000) {
        await frame()
        const now = performance.now() - t0
        if (toClass < 0 && el.classList.contains("selected")) toClass = now
        if (toFiles < 0 && filesText() !== filesBefore && filesText().length > 0) toFiles = now
        if (
          toDiff < 0 &&
          !q("diff-loading") &&
          q("diff-lines") !== null &&
          diffText() !== diffBefore &&
          diffText().length > 0
        )
          toDiff = now
        if (toClass >= 0 && toFiles >= 0 && toDiff >= 0) break
        // Two neighbouring commits can list the same files (e.g. PLAN.md only):
        // the list text then never changes, so the files stage is the diff stage.
        if (toDiff >= 0 && toFiles < 0) toFiles = toDiff
      }
      return { row, toClass: Math.round(toClass), toFiles: Math.round(toFiles), toDiff: Math.round(toDiff) }
    }, row)
    samples.push(sample)
    await expect(rows.nth(row)).toHaveClass(/selected/)
  }

  const summary = samples.map((s) => `row ${s.row}: class ${s.toClass} ms, files ${s.toFiles} ms, diff ${s.toDiff} ms`)
  test.info().annotations.push({ type: "latency", description: summary.join(" | ") })
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const worstDiff = Math.max(...samples.map((s) => s.toDiff))
  expect(
    samples.every((s) => s.toClass >= 0 && s.toFiles >= 0 && s.toDiff >= 0),
    `every stage observed: ${summary.join(" | ")}`,
  ).toBe(true)
  // Dev build, steady state, this repository: 2026-09-05 baseline was a
  // median of ~1100 ms (150 ms debounce, a wasted diff request for the
  // previous file, then files → diff serially). After v0.13.14 (leading-edge
  // debounce, /changes = files + first diff in one round trip, prefetch on
  // selection commit) the median is ~400 ms; production measures ~200 ms.
  // The worst case is a commit whose first diff is large (PLAN.md), which
  // is render cost, hence the looser bound.
  expect(median(samples.map((s) => s.toDiff)), `median click → diff (${summary.join(" | ")})`).toBeLessThan(700)
  expect(worstDiff, `worst click → diff (${summary.join(" | ")})`).toBeLessThan(2500)
})

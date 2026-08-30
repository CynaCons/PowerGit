import { expect, test } from "vitest"
import { createLayouter, layoutGraph } from "./layout"
import { syntheticHistory } from "./synthetic"

test("linear history stays on lane 0", () => {
  const rows = layoutGraph([
    { id: "c", parents: ["b"], message: "c", author: "a", date: "1", refs: ["HEAD"] },
    { id: "b", parents: ["a"], message: "b", author: "a", date: "1", refs: [] },
    { id: "a", parents: [], message: "a", author: "a", date: "1", refs: [] },
  ])
  expect(rows.map((r) => r.lane)).toEqual([0, 0, 0])
  expect(rows[0].isHead).toBe(true)
  expect(rows[0].hasRefs).toBe(true)
  expect(rows[1].hasRefs).toBe(false)
})

test("merge occupies a second lane then collapses", () => {
  const rows = layoutGraph([
    { id: "m", parents: ["b", "f"], message: "merge", author: "a", date: "1", refs: [] },
    { id: "f", parents: ["a"], message: "feature", author: "a", date: "1", refs: ["feature"] },
    { id: "b", parents: ["a"], message: "main", author: "a", date: "1", refs: [] },
    { id: "a", parents: [], message: "root", author: "a", date: "1", refs: [] },
  ])
  expect(rows[0].lane).toBe(0)
  expect(rows.some((r) => r.lane > 0)).toBe(true)
  expect(rows[1].hasRefs).toBe(true)
})

test("10k synthetic layout stays under 400ms and within 40 lanes", () => {
  const revs = syntheticHistory(10_000)
  const t0 = performance.now()
  const rows = layoutGraph(revs)
  const ms = performance.now() - t0
  expect(rows).toHaveLength(10_000)
  const maxLane = rows.reduce((m, r) => Math.max(m, r.lane), 0)
  expect(maxLane).toBeLessThan(40)
  expect(ms).toBeLessThan(400)
})

test("append-only layout is identical to a full relayout", () => {
  const revs = syntheticHistory(2_000)
  const full = layoutGraph(revs)

  // Uneven chunk sizes on purpose: 1-row batches, page-sized batches, and a
  // final partial page must all continue the layout without disturbing it.
  const layouter = createLayouter()
  const cuts = [0, 1, 3, 250, 251, 1000, 1999, 2000]
  const incremental = []
  for (let c = 0; c < cuts.length - 1; c++) {
    incremental.push(...layouter.append(revs.slice(cuts[c], cuts[c + 1])))
  }

  expect(layouter.rowCount()).toBe(full.length)
  expect(incremental).toEqual(full)
})

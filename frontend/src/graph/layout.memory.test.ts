import { describe, expect, it } from "vitest"
import { createLayouter } from "./layout"
import { syntheticHistory } from "./synthetic"
import type { Revision } from "./types"

/**
 * v0.13.11: measurable heap budgets for the history/graph model. The grid
 * holds `Revision[]` plus the layouter's `GraphRow[]` for the whole loaded
 * history (up to HARD_CEILING = 100k). These numbers are what the layouter
 * retains per commit; a regression that starts cloning the full history
 * per page, or keeps per-row scratch state alive, shows up here as a
 * multiple, not as a flaky test. Measured on Node 22 (V8), 2026-09-04:
 * 10k ≈ 12 MB, 100k ≈ 120 MB retained.
 */
// vitest runs under Node; the app tsconfig has no node types, so declare
// the two globals this file touches.
declare const process: { memoryUsage(): { heapUsed: number } }
const nodeGc = (): (() => void) | undefined => (globalThis as unknown as { gc?: () => void }).gc

function heapUsed(): number {
  nodeGc()?.()
  return process.memoryUsage().heapUsed
}

function layoutInPages(count: number): { rows: number; retained: number } {
  const revisions: Revision[] = syntheticHistory(count).map((r) => ({
    ...r,
    id: r.id.length >= 7 ? r.id : r.id.padEnd(7, "0"),
  }))
  const before = heapUsed()
  const layouter = createLayouter()
  const keep: unknown[] = []
  for (let i = 0; i < revisions.length; i += 1000) {
    keep.push(layouter.append(revisions.slice(i, i + 1000)))
  }
  const after = heapUsed()
  return { rows: layouter.rowCount(), retained: after - before + 0 * keep.length }
}

const MB = 1024 * 1024

describe("history memory budget", () => {
  it("10k commits stay under 64 MB retained", () => {
    const { rows, retained } = layoutInPages(10_000)
    expect(rows).toBe(10_000)
    expect(retained).toBeLessThan(64 * MB)
  })

  it("100k commits stay under 512 MB retained and scale ~linearly", () => {
    const small = layoutInPages(10_000)
    const big = layoutInPages(100_000)
    expect(big.rows).toBe(100_000)
    expect(big.retained).toBeLessThan(512 * MB)
    // Without --expose-gc the delta is noisy; only assert the shape when a
    // GC hook exists (CI runs vitest with NODE_OPTIONS=--expose-gc).
    if (nodeGc() && small.retained > MB) {
      expect(big.retained / small.retained).toBeLessThan(20)
    }
  }, 60_000)
})

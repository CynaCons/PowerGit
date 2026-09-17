import { describe, expect, it } from "vitest"
import { createLayouter } from "./layout"
import { withoutRevision } from "./layoutProtocol"
import { syntheticHistory } from "./synthetic"
import type { GraphRow, Revision } from "./types"

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
declare const process: {
  memoryUsage(): { heapUsed: number }
  getBuiltinModule(name: "v8"): { serialize(value: unknown): { byteLength: number } }
}
const serialize = process.getBuiltinModule("v8").serialize
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

function sameGraph(row: GraphRow, previous: GraphRow): boolean {
  return row.lane === previous.lane &&
    row.color === previous.color &&
    row.hasRefs === previous.hasRefs &&
    row.isHead === previous.isHead &&
    JSON.stringify(row.segments) === JSON.stringify(previous.segments)
}

describe("reset patch measurement", () => {
  it("measures a 10k reload with one new commit on top (v0.18.18)", () => {
    const before = syntheticHistory(10_000)
    const after: Revision[] = [{
      ...before[0], id: "f".repeat(40), parents: [before[0].id], refs: ["HEAD", "master"],
    }, ...before.map((rev, index) => index === 0 ? { ...rev, refs: rev.refs.filter((ref) => ref !== "HEAD" && ref !== "master") } : rev)]
    const previousRows = createLayouter().append(before)
    const refreshedRows = createLayouter().append(after)
    const changed = refreshedRows.slice(1).filter((row, index) => !sameGraph(row, previousRows[index])).length
    // 9 / 10,000 = 0.09% on the deterministic synthetic graph. This is
    // far smaller than returning the 10,001-row reset result across the
    // worker boundary, so the compact patch is warranted.
    expect(changed).toBe(9)
  }, 30_000)
})

function objectCount(value: unknown): number {
  if (value === null || typeof value !== "object") return 0
  if (Array.isArray(value)) return 1 + value.reduce((sum, item) => sum + objectCount(item), 0)
  return 1 + Object.values(value).reduce((sum, item) => sum + objectCount(item), 0)
}

describe("append reply measurement", () => {
  it("reports the 3,000-row reply before and after revisions are re-attached on the main thread (v0.18.18)", () => {
    const revisions = syntheticHistory(13_000)
    const layouter = createLayouter()
    layouter.append(revisions.slice(0, 10_000))
    const rows = layouter.append(revisions.slice(10_000))
    const before = { seq: 1, reset: false, from: 10_000, rows }
    const after = { seq: 1, reset: false, from: 10_000, rows: rows.map(withoutRevision) }
    const measure = (reply: unknown) => ({
      bytes: serialize(reply).byteLength,
      objects: objectCount(reply),
    })
    const oldReply = measure(before)
    const slimReply = measure(after)

    // Keep this visible in the focused perf test: unlike timing, these
    // deterministic payload measurements are stable across machines.
    console.info("layout append reply", { before: oldReply, after: slimReply })
    expect(slimReply.bytes).toBeLessThan(oldReply.bytes * 0.85)
    expect(slimReply.objects).toBeLessThan(oldReply.objects * 0.7)
  }, 30_000)
})

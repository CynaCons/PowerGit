import { describe, expect, it } from "vitest"
import { edgeInScope, inScope, markAncestry } from "./ancestry"
import { layoutGraph } from "./layout"
import { syntheticHistory } from "./synthetic"
import type { Revision } from "./types"

function rev(id: string, parents: string[], refs: string[] = []): Revision {
  return { id: id.padEnd(40, "0"), parents: parents.map((p) => p.padEnd(40, "0")), message: id, author: "a", date: "", refs }
}
const id = (s: string) => s.padEnd(40, "0")

describe("markAncestry", () => {
  // Newest first, parents after children:
  //   head (HEAD, main) -> merge -> [main2, feat2 -> feat1] -> base
  //   wip is an unmerged branch off base.
  const rows = layoutGraph([
    rev("head", ["merge"], ["HEAD", "main"]),
    rev("wip", ["base"], ["wip"]),
    rev("merge", ["main2", "feat2"]),
    rev("feat2", ["feat1"], ["feature"]),
    rev("main2", ["base"]),
    rev("feat1", ["base"]),
    rev("base", []),
  ])
  const a = markAncestry(rows)!

  it("marks the first-parent line 2 and merged-in work 1", () => {
    expect(a.headId).toBe(id("head"))
    expect(a.marks.get(id("head"))).toBe(2)
    expect(a.marks.get(id("merge"))).toBe(2)
    expect(a.marks.get(id("main2"))).toBe(2)
    expect(a.marks.get(id("base"))).toBe(2)
    expect(a.marks.get(id("feat2"))).toBe(1)
    expect(a.marks.get(id("feat1"))).toBe(1)
  })

  it("leaves unmerged branches unmarked", () => {
    expect(a.marks.has(id("wip"))).toBe(false)
    expect(inScope(a, "all", id("wip"))).toBe(false)
  })

  it("scope decides what counts", () => {
    expect(inScope(a, "all", id("feat1"))).toBe(true)
    expect(inScope(a, "first-parent", id("feat1"))).toBe(false)
    expect(inScope(a, "first-parent", id("merge"))).toBe(true)
    // merge -> main2 is the mainline edge; merge -> feat2 is not.
    expect(edgeInScope(a, "first-parent", id("merge"), id("main2"), id("main2"))).toBe(true)
    expect(edgeInScope(a, "first-parent", id("merge"), id("feat2"), id("main2"))).toBe(false)
    expect(edgeInScope(a, "all", id("merge"), id("feat2"), id("main2"))).toBe(true)
    expect(edgeInScope(a, "all", id("wip"), id("base"), id("base"))).toBe(false)
  })

  it("returns null when HEAD is not among the loaded rows", () => {
    expect(markAncestry(layoutGraph([rev("x", ["y"]), rev("y", [])]))).toBeNull()
    expect(inScope(null, "all", id("x"))).toBe(false)
  })

  it("reaches the root of the synthetic demo history and skips its open branches", () => {
    const rows = layoutGraph(syntheticHistory(200))
    const a = markAncestry(rows)!
    expect(a.marks.get(rows[0].rev.id)).toBe(2)
    expect(a.marks.get(rows[rows.length - 1].rev.id)).toBeDefined()
    // Every row on the first-parent chain from HEAD is 2, and its first
    // parent is 2 too.
    const byId = new Map(rows.map((r) => [r.rev.id, r]))
    for (const r of rows) {
      if (a.marks.get(r.rev.id) !== 2) continue
      const p = r.rev.parents[0]
      if (p) expect(a.marks.get(p)).toBe(2)
    }
    // The forced open fork near the top is not reachable from HEAD.
    const unmarked = rows.filter((r) => !a.marks.has(r.rev.id))
    expect(unmarked.length).toBeGreaterThan(0)
    for (const r of unmarked) expect(byId.get(r.rev.id)?.isHead).toBe(false)
  })
})

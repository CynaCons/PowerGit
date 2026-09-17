import { describe, expect, it } from "vitest"
import { ancestryFullWalks, edgeInScope, extendAncestry, inScope, markAncestry } from "./ancestry"
import { withArtificialRows } from "./artificial"
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
    expect(a.rootId).toBe(id("head"))
    expect(a.temporary).toBe(false)
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

  // v0.18.4, owner: "right click on a commit and hit Highlight ancestry and
  // then temporarily all the ancestry is highlighted like we do for the
  // current branch."
  describe("with a temporary root", () => {
    const t = markAncestry(rows, id("feat2"))!

    it("greys the commits only HEAD reaches and keeps the root's own history", () => {
      expect(t.rootId).toBe(id("feat2"))
      expect(t.temporary).toBe(true)
      expect(t.marks.get(id("feat2"))).toBe(2)
      expect(t.marks.get(id("feat1"))).toBe(2)
      expect(t.marks.get(id("base"))).toBe(2)
      for (const only of ["head", "merge", "main2", "wip"]) expect(t.marks.has(id(only)), only).toBe(false)
    })

    it("first-parent scope runs from the root, not from HEAD", () => {
      const m = markAncestry(rows, id("merge"))!
      expect(m.temporary).toBe(true)
      expect(inScope(m, "first-parent", id("main2"))).toBe(true)
      expect(inScope(m, "first-parent", id("feat2"))).toBe(false)
      expect(inScope(m, "all", id("feat2"))).toBe(true)
      expect(inScope(m, "all", id("head"))).toBe(false)
      expect(edgeInScope(m, "first-parent", id("merge"), id("main2"), id("main2"))).toBe(true)
      expect(edgeInScope(m, "all", id("head"), id("merge"), id("merge"))).toBe(false)
    })

    it("returns null when the root is not among the loaded rows", () => {
      expect(markAncestry(rows, id("gone"))).toBeNull()
    })

    it("HEAD as an explicit root is the default, pending rows included", () => {
      const pending = withArtificialRows(rows, { unstagedCount: 1, stagedCount: 1 })
      const explicit = markAncestry(pending, id("head"))!
      const byDefault = markAncestry(pending)!
      expect(explicit.temporary).toBe(false)
      expect([...explicit.marks]).toEqual([...byDefault.marks])
      expect(explicit.marks.get("WORKTREE")).toBe(2)
      expect(explicit.marks.get("INDEX")).toBe(2)
      // A side root never reaches the pending rows: they are HEAD's future.
      const side = markAncestry(pending, id("feat2"))!
      expect(side.marks.has("WORKTREE")).toBe(false)
      expect(side.marks.has("INDEX")).toBe(false)
    })
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

  it("matches a full walk when a merge history is appended", () => {
    const prefix = rows.slice(0, 3)
    const appended = rows.slice(0, 6)
    const incremental = extendAncestry(prefix, markAncestry(prefix), appended)!
    expect([...incremental.marks]).toEqual([...markAncestry(appended)!.marks])
  })

  it("matches a full walk for a 10k-row append and recomputes for a new root", () => {
    const rows = layoutGraph(syntheticHistory(10_000))
    const prefix = rows.slice(0, 5_000)
    const incremental = extendAncestry(prefix, markAncestry(prefix), rows)!
    expect([...incremental.marks]).toEqual([...markAncestry(rows)!.marks])
    const root = rows[100].rev.id
    const changedRoot = extendAncestry(prefix, markAncestry(prefix), rows, root)
    expect([...changedRoot!.marks]).toEqual([...markAncestry(rows, root)!.marks])
  })
})

describe("pending-row append", () => {
  it("keeps the artificial prefix so extendAncestry avoids a full walk (v0.18.18)", () => {
    const enginePrefix = layoutGraph([rev("head", ["middle"], ["HEAD"]), rev("middle", ["root"]), rev("root", [])])
    const pendingPrefix = withArtificialRows(enginePrefix, { unstagedCount: 2, stagedCount: 1 })
    const ancestry = markAncestry(pendingPrefix)
    const engineAppend = [...enginePrefix, ...layoutGraph([rev("older", [])])]
    const pendingAppend = withArtificialRows(engineAppend, { unstagedCount: 2, stagedCount: 1 })
    const before = ancestryFullWalks()

    extendAncestry(pendingPrefix, ancestry, pendingAppend)

    expect(ancestryFullWalks()).toBe(before)
    expect(pendingAppend[0]).toBe(pendingPrefix[0])
    expect(pendingAppend[1]).toBe(pendingPrefix[1])
    expect(pendingAppend[2]).toBe(pendingPrefix[2])
  })
})

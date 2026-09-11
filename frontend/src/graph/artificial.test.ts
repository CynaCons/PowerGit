import { describe, expect, it } from "vitest"
import { INDEX_ID, WORKTREE_ID, withArtificialRows } from "./artificial"
import { layoutGraph } from "./layout"
import type { Revision } from "./types"

function rev(id: string, parents: string[], refs: string[] = []): Revision {
  return { id: id.padEnd(40, "0"), parents: parents.map((p) => p.padEnd(40, "0")), message: id, author: "a", date: "", refs }
}
const id = (s: string) => s.padEnd(40, "0")

describe("withArtificialRows", () => {
  const linear = layoutGraph([rev("head", ["b"], ["HEAD", "main"]), rev("b", ["a"]), rev("a", [])])

  it("returns the same array when the tree is clean or HEAD is not loaded", () => {
    expect(withArtificialRows(linear, null)).toBe(linear)
    expect(withArtificialRows(linear, { unstagedCount: 0, stagedCount: 0 })).toBe(linear)
    const noHead = layoutGraph([rev("x", ["y"]), rev("y", [])])
    expect(withArtificialRows(noHead, { unstagedCount: 2, stagedCount: 0 })).toBe(noHead)
  })

  it("chains to the anchor row when HEAD is not loaded (file history, v0.16.0)", () => {
    const noHead = layoutGraph([rev("x", ["y"]), rev("y", [])])
    const rows = withArtificialRows(noHead, { unstagedCount: 1, stagedCount: 0 }, 0)
    expect(rows).toHaveLength(3)
    expect(rows[0].rev.id).toBe(WORKTREE_ID)
    expect(rows[0].rev.parents).toEqual([id("x")])
    expect(rows[1].rev.id).toBe(id("x"))
    // The anchor is ignored when HEAD is there, and when it is out of range.
    expect(withArtificialRows(linear, { unstagedCount: 1, stagedCount: 0 }, 2)[1].rev.id).toBe(id("head"))
    expect(withArtificialRows(noHead, { unstagedCount: 1, stagedCount: 0 }, 5)).toBe(noHead)
  })

  it("adds a Working directory row above HEAD in HEAD's lane, chained by a segment", () => {
    const rows = withArtificialRows(linear, { unstagedCount: 3, stagedCount: 0 })
    expect(rows).toHaveLength(4)
    const wd = rows[0]
    expect(wd.rev.id).toBe(WORKTREE_ID)
    expect(wd.artificial).toBe("worktree")
    expect(wd.rev.message).toBe("Working directory (3 files)")
    expect(wd.rev.parents).toEqual([id("head")])
    expect(wd.lane).toBe(linear[0].lane)
    expect(wd.segments).toHaveLength(1)
    expect(wd.segments[0]).toMatchObject({ childId: WORKTREE_ID, parentId: id("head"), lane: wd.lane })
    // HEAD carries the incoming segment; the original row object is untouched.
    expect(rows[1].rev.id).toBe(id("head"))
    expect(rows[1].segments).toContainEqual(wd.segments[0])
    expect(linear[0].segments).not.toContainEqual(wd.segments[0])
    expect(rows[2]).toBe(linear[1])
  })

  it("chains Working directory -> Index -> HEAD when both exist", () => {
    const rows = withArtificialRows(linear, { unstagedCount: 1, stagedCount: 2 })
    expect(rows.map((r) => r.rev.id).slice(0, 3)).toEqual([WORKTREE_ID, INDEX_ID, id("head")])
    expect(rows[0].rev.parents).toEqual([INDEX_ID])
    expect(rows[1].rev.parents).toEqual([id("head")])
    expect(rows[1].rev.message).toBe("Index (2 files)")
    // Index carries WORKTREE's incoming segment plus its own.
    expect(rows[1].segments.map((s) => s.id)).toEqual([`${INDEX_ID}:${id("head")}`, `${WORKTREE_ID}:${INDEX_ID}`])
  })

  it("lets every line from the row above pass through the inserted rows (v0.14.3)", () => {
    // topic sits above head and its line to base runs past head: it must
    // still be drawn on the Working directory row, in the lane it has on
    // HEAD's row.
    const rows = layoutGraph([
      rev("topic", ["base"], ["topic"]),
      rev("head", ["base"], ["HEAD", "main"]),
      rev("base", []),
    ])
    const out = withArtificialRows(rows, { unstagedCount: 1, stagedCount: 1 })
    const headIndex = out.findIndex((r) => r.isHead)
    const above = out[headIndex - 3]
    expect(above.rev.id).toBe(id("topic"))
    const continuing = above.segments.filter((s) => s.parentId !== above.rev.id)
    expect(continuing.length).toBeGreaterThan(0)
    for (const row of [out[headIndex - 2], out[headIndex - 1]]) {
      expect(row.artificial).toBeDefined()
      for (const s of continuing) {
        const copy = row.segments.find((x) => x.id === s.id)
        expect(copy).toBeDefined()
        const onHead = out[headIndex].segments.find((h) => h.id === s.id)
        expect(copy!.lane).toBe(onHead ? onHead.lane : s.lane)
      }
      // The pending row's own lane stays clear of a line that runs past HEAD.
      const busy = continuing.filter((s) => s.parentId !== id("head")).map((s) => s.lane)
      expect(busy).not.toContain(row.lane)
    }
  })

  it("takes a free lane when a line passes through HEAD's lane above it", () => {
    // topic (newest, on another branch) -> base; head -> base. Date order
    // puts topic above head; whether a lane is busy depends on the layout.
    const rows = layoutGraph([
      rev("topic", ["base"], ["topic"]),
      rev("head", ["base"], ["HEAD", "main"]),
      rev("base", []),
    ])
    const out = withArtificialRows(rows, { unstagedCount: 1, stagedCount: 0 })
    const wd = out.find((r) => r.rev.id === WORKTREE_ID)!
    const headIndex = out.findIndex((r) => r.isHead)
    expect(out[headIndex - 1]).toBe(wd)
    const above = out[headIndex - 2]
    const busy = above.segments.some((s) => s.lane === rows[1].lane && s.parentId !== id("head"))
    expect(wd.lane).toBe(busy ? Math.max(above.lane, ...above.segments.map((s) => s.lane), rows[1].lane) + 1 : rows[1].lane)
  })
})

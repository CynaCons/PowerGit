import { describe, expect, it } from "vitest"
import { withArtificialRows } from "./artificial"
import {
  firstChildOf,
  headSha,
  NavHistory,
  navTargets,
  ParentChildMemory,
  parentsOf,
  reasonText,
  rowOf,
} from "./graphNav"
import { layoutGraph } from "./layout"
import type { Revision } from "./types"

function rev(id: string, parents: string[], refs: string[] = []): Revision {
  return {
    id: id.padEnd(40, "0"),
    parents: parents.map((p) => p.padEnd(40, "0")),
    message: id,
    author: "a",
    date: "",
    refs,
  }
}
const id = (s: string) => s.padEnd(40, "0")

// Newest first, parents after children — a merge, a root and a tip:
//   head (HEAD, main) -> merge -> [main2, feat2 -> feat1] -> base
//   wip is an unmerged tip off base.
const rows = layoutGraph([
  rev("head", ["merge"], ["HEAD", "main"]),
  rev("wip", ["base"], ["wip"]),
  rev("merge", ["main2", "feat2"]),
  rev("feat2", ["feat1"], ["feature"]),
  rev("main2", ["base"]),
  rev("feat1", ["base"]),
  rev("base", []),
])
const row = (s: string) => rowOf(rows, id(s))

describe("parentsOf / firstChildOf / headSha", () => {
  it("lists a commit's parents in git order, the first parent first", () => {
    expect(parentsOf(rows, id("merge"))).toEqual([id("main2"), id("feat2")])
    expect(parentsOf(rows, id("head"))).toEqual([id("merge")])
  })

  it("the root has no parent; an unknown SHA has none either", () => {
    expect(parentsOf(rows, id("base"))).toEqual([])
    expect(parentsOf(rows, id("nowhere"))).toEqual([])
  })

  it("the first child is the topmost loaded row that lists the commit as a parent (GE)", () => {
    // base has three children: wip (row 1), main2 (row 4), feat1 (row 5).
    expect(firstChildOf(rows, id("base"))).toBe(id("wip"))
    expect(firstChildOf(rows, id("merge"))).toBe(id("head"))
    expect(firstChildOf(rows, id("feat1"))).toBe(id("feat2"))
  })

  it("a tip has no child in the loaded graph", () => {
    expect(firstChildOf(rows, id("head"))).toBeNull()
    expect(firstChildOf(rows, id("wip"))).toBeNull()
  })

  it("HEAD is the row flagged isHead", () => {
    expect(headSha(rows)).toBe(id("head"))
    expect(headSha([])).toBeNull()
  })

  it("the index is built once per rows array and by reference", () => {
    const copy = [...rows]
    expect(firstChildOf(copy, id("base"))).toBe(id("wip"))
    expect(rowOf(copy, id("base"))).toBe(rowOf(rows, id("base")))
  })
})

describe("pending rows", () => {
  const pending = withArtificialRows(rows, { unstagedCount: 1, stagedCount: 1 })

  it("are never a commit's child: HEAD keeps 'no child' with pending changes on top", () => {
    expect(pending[0].artificial).toBe("worktree")
    expect(firstChildOf(pending, id("head"))).toBeNull()
  })

  it("have no parent to navigate to and the targets say so", () => {
    expect(parentsOf(pending, "WORKTREE")).toEqual([])
    const t = navTargets(pending, pending[0])
    expect(t.pending).toBe(true)
    expect(t.parentReason).toBe("pending")
    expect(t.childReason).toBe("pending")
    expect(reasonText(t.parentReason!)).toBe("Select a commit to navigate")
    // HEAD is still reachable from a pending row.
    expect(t.head).toBe(id("head"))
    expect(t.headReason).toBeNull()
  })
})

describe("navTargets", () => {
  it("at a merge: first parent, its child, HEAD elsewhere", () => {
    const t = navTargets(rows, row("merge"))
    expect(t.parents).toEqual([id("main2"), id("feat2")])
    expect(t.parent).toBe(id("main2"))
    expect(t.child).toBe(id("head"))
    expect(t.atHead).toBe(false)
    expect(t.parentReason).toBeNull()
    expect(t.childReason).toBeNull()
    expect(t.headReason).toBeNull()
  })

  it("at HEAD: no child in the loaded history, already at HEAD", () => {
    const t = navTargets(rows, row("head"))
    expect(t.atHead).toBe(true)
    expect(t.childReason).toBe("no-child")
    expect(t.headReason).toBe("at-head")
    expect(reasonText("no-child")).toBe("No child in the loaded history")
    expect(reasonText("at-head")).toBe("Already at HEAD")
  })

  it("at the root: no parent — first commit", () => {
    const t = navTargets(rows, row("base"))
    expect(t.parent).toBeNull()
    expect(t.parentReason).toBe("no-parent")
    expect(reasonText("no-parent")).toBe("No parent — first commit")
    expect(t.child).toBe(id("wip"))
  })

  it("with nothing selected every button has a reason", () => {
    const t = navTargets(rows, undefined)
    expect(t.parentReason).toBe("none")
    expect(t.childReason).toBe("none")
    expect(t.headReason).toBeNull()
    expect(navTargets([], undefined).headReason).toBe("no-head")
  })
})

describe("ParentChildMemory (GE's way back)", () => {
  it("go to parent from the merge, then go to child returns to the merge, not the first loaded child", () => {
    const m = new ParentChildMemory()
    // main2's first loaded child is merge here too, so use base: its first
    // child is wip, but we arrived from main2.
    m.toParent(id("main2"), id("base"))
    m.settle(id("base"))
    const t = navTargets(rows, row("base"), m)
    expect(t.child).toBe(id("main2"))
    expect(t.childReason).toBeNull()
    m.toChild(id("base"), t.child!)
    m.settle(id("main2"))
    // And back down again: the parent remembered is base, which is also
    // the first parent; the stacks do not grow on a round trip.
    expect(navTargets(rows, row("main2"), m).parent).toBe(id("base"))
  })

  it("go to child then go to parent returns where it came from", () => {
    const m = new ParentChildMemory()
    m.toChild(id("feat1"), id("feat2"))
    m.settle(id("feat2"))
    expect(navTargets(rows, row("feat2"), m).parent).toBe(id("feat1"))
    m.toParent(id("feat2"), id("feat1"))
    m.settle(id("feat1"))
    expect(m.previousParent).toBeNull()
    expect(m.previousChild).toBe(id("feat2"))
  })

  it("any other selection change forgets the way back", () => {
    const m = new ParentChildMemory()
    m.toParent(id("merge"), id("main2"))
    m.settle(id("main2"))
    expect(m.previousChild).toBe(id("merge"))
    m.settle(id("wip")) // a click elsewhere
    expect(m.previousChild).toBeNull()
    expect(navTargets(rows, row("main2"), m).child).toBe(id("merge")) // the loaded graph's answer
  })

  it("a remembered child wins even when the loaded graph has none (from above the window)", () => {
    const m = new ParentChildMemory()
    m.toParent(id("above"), id("head"))
    m.settle(id("head"))
    const t = navTargets(rows, row("head"), m)
    expect(t.child).toBe(id("above"))
    expect(t.childReason).toBeNull()
  })
})

describe("NavHistory (Alt+← / Alt+→)", () => {
  it("walks back and forward over the selections", () => {
    const h = new NavHistory()
    expect(h.canBack).toBe(false)
    h.push("a")
    h.push("b")
    h.push("c")
    expect(h.canBack).toBe(true)
    expect(h.canForward).toBe(false)
    expect(h.back()).toBe("b")
    expect(h.back()).toBe("a")
    expect(h.back()).toBeNull()
    expect(h.forward()).toBe("b")
    expect(h.forward()).toBe("c")
    expect(h.forward()).toBeNull()
  })

  it("the selection a walk lands on is not pushed again", () => {
    const h = new NavHistory()
    h.push("a")
    h.push("b")
    expect(h.back()).toBe("a")
    h.push("a") // the selection effect reporting the landing
    expect(h.canForward).toBe(true)
    expect(h.forward()).toBe("b")
  })

  it("a new selection after a walk drops the forward entries", () => {
    const h = new NavHistory()
    h.push("a")
    h.push("b")
    h.push("c")
    h.back()
    h.back()
    h.push("d")
    expect(h.canForward).toBe(false)
    expect(h.back()).toBe("a")
    expect(h.forward()).toBe("d")
  })

  it("the same SHA twice in a row is one entry", () => {
    const h = new NavHistory()
    h.push("a")
    h.push("a")
    h.push("b")
    expect(h.back()).toBe("a")
    expect(h.back()).toBeNull()
  })

  it("keeps the last 50", () => {
    const h = new NavHistory(50)
    for (let i = 0; i < 60; i++) h.push(`s${i}`)
    let n = 0
    while (h.back() !== null) n++
    expect(n).toBe(49)
    expect(h.current).toBe("s10")
  })

  it("clear forgets everything (a repository switch)", () => {
    const h = new NavHistory()
    h.push("a")
    h.push("b")
    h.clear()
    expect(h.canBack).toBe(false)
    expect(h.current).toBeNull()
  })
})

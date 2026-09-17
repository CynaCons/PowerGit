import { describe, expect, it } from "vitest"
import type { RevisionDto } from "../engine"
import { applyGraphResetPatch, mergeReload, toRevision } from "./historyMerge"
import type { GraphRow, Revision } from "../graph/types"

function dto(i: number, refs: string[] = []): RevisionDto {
  return {
    id: `c${i}`.padEnd(7, "0"),
    parents: i > 0 ? [`c${i - 1}`.padEnd(7, "0")] : [],
    subject: `commit ${i}`,
    author: "a",
    date: "2026-09-07T10:00:00",
    refs,
  } as RevisionDto
}

const PAGE = 3
const revision = (id: string): Revision => ({ id, parents: [], message: id, author: "a", date: "2026-09-17", refs: [] })
const row = (rev: Revision, lane = 0): GraphRow => ({ rev, lane, color: lane, hasRefs: false, isHead: false, segments: [] })

describe("mergeReload", () => {
  it("keeps every row object and reports unchanged when nothing moved", () => {
    const page = [dto(5, ["HEAD", "main"]), dto(4), dto(3)]
    const old = [...page.map(toRevision), toRevision(dto(2)), toRevision(dto(1))]
    const m = mergeReload(page, old, PAGE, true)
    expect(m.unchanged).toBe(true)
    expect(m.next).toBe(old)
    expect(m.complete).toBe(true)
  })

  it("a new commit on top replaces only the rows that changed", () => {
    const old = [dto(5, ["HEAD", "main"]), dto(4), dto(3), dto(2)].map(toRevision)
    const page = [dto(6, ["HEAD", "main"]), dto(5), dto(4)]
    const m = mergeReload(page, old, PAGE, false)
    expect(m.unchanged).toBe(false)
    expect(m.next.map((r) => r.id)).toEqual([dto(6).id, dto(5).id, dto(4).id, dto(3).id, dto(2).id])
    expect(m.next[1]).not.toBe(old[0])
    expect(m.next[2]).toBe(old[1])
    expect(m.next[3]).toBe(old[2])
    expect(m.next[4]).toBe(old[3])
  })

  it("falls back to the fresh page when the overlap is gone", () => {
    const old = [dto(9), dto(8), dto(7)].map(toRevision)
    const page = [dto(3), dto(2), dto(1)]
    const m = mergeReload(page, old, PAGE, false)
    expect(m.next.map((r) => r.id)).toEqual(page.map((d) => d.id))
    expect(m.complete).toBe(false)
  })

  it("a short page means the history is complete", () => {
    const m = mergeReload([dto(1), dto(0)], [], PAGE, false)
    expect(m.complete).toBe(true)
    expect(m.unchanged).toBe(false)
  })
})

describe("applyGraphResetPatch", () => {
  it("keeps an unchanged row object when a new top commit shifts its index (v0.18.18)", () => {
    const old = revision("old")
    const prior = row(old)
    const head = revision("head")
    const next = applyGraphResetPatch([prior], [head, old], new Map([[0, row(head)]]))
    expect(next).toEqual([row(head), prior])
    expect(next[1]).toBe(prior)
  })
})

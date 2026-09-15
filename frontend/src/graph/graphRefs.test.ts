import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { RefTree } from "../engine/types"
import {
  DEFAULT_GRAPH_REFS,
  GRAPH_REFS_KEY,
  getGraphRefs,
  graphRefCounts,
  parseGraphRefs,
  resetGraphRefsCache,
  setGraphRefs,
} from "./graphRefs"

// A localStorage stand-in for the node environment (the store must survive
// a missing or refusing storage anyway).
function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    map,
  }
}

describe("parseGraphRefs", () => {
  it("defaults to the mode off with nothing checked", () => {
    expect(parseGraphRefs(null)).toEqual({ mode: false, refs: [] })
    expect(DEFAULT_GRAPH_REFS.mode).toBe(false)
  })

  it("keeps full ref names only, once each, and reads the mode strictly", () => {
    expect(parseGraphRefs('{"mode":true,"refs":["refs/heads/a","a",7,"refs/heads/a","refs/tags/v1"]}')).toEqual({
      mode: true,
      refs: ["refs/heads/a", "refs/tags/v1"],
    })
    expect(parseGraphRefs('{"mode":"yes","refs":"refs/heads/a"}')).toEqual({ mode: false, refs: [] })
  })

  it("ignores garbage", () => {
    expect(parseGraphRefs("{not json")).toEqual(DEFAULT_GRAPH_REFS)
  })
})

describe("graphRefs store", () => {
  const storage = fakeStorage()
  beforeEach(() => {
    storage.clear()
    resetGraphRefsCache()
    ;(globalThis as { window?: unknown }).window = { localStorage: storage }
  })
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
    resetGraphRefsCache()
  })

  it("is per repository and persists under its own key", () => {
    expect(getGraphRefs(null)).toBe(DEFAULT_GRAPH_REFS)
    setGraphRefs("r1", { mode: true, refs: ["refs/heads/a"] })
    expect(getGraphRefs("r1")).toEqual({ mode: true, refs: ["refs/heads/a"] })
    expect(getGraphRefs("r2")).toEqual(DEFAULT_GRAPH_REFS)
    expect(storage.map.get(`${GRAPH_REFS_KEY}r1`)).toBe('{"mode":true,"refs":["refs/heads/a"]}')
    // A fresh cache reads it back.
    resetGraphRefsCache()
    expect(getGraphRefs("r1")).toEqual({ mode: true, refs: ["refs/heads/a"] })
  })

  it("keeps the snapshot identity until something changes", () => {
    setGraphRefs("r1", { mode: true, refs: ["refs/heads/a"] })
    const before = getGraphRefs("r1")
    setGraphRefs("r1", { refs: ["refs/heads/a"] })
    expect(getGraphRefs("r1")).toBe(before)
    setGraphRefs("r1", { mode: false })
    expect(getGraphRefs("r1")).not.toBe(before)
    expect(getGraphRefs("r1").refs).toEqual(["refs/heads/a"])
  })
})

describe("graphRefCounts", () => {
  const ref = (name: string, prefix: string, current = false) => ({
    name,
    fullName: `${prefix}${name}`,
    target: "0".repeat(40),
    current,
  })
  const tree: RefTree = {
    branches: [ref("main", "refs/heads/", true), ref("a", "refs/heads/"), ref("b", "refs/heads/")],
    remotes: [ref("origin/main", "refs/remotes/")],
    tags: [ref("v1", "refs/tags/")],
    submodules: [],
  }

  it("counts the checked refs plus the checked-out branch, once", () => {
    expect(graphRefCounts(tree, { mode: true, refs: [] })).toEqual({ shown: 1, total: 5 })
    expect(graphRefCounts(tree, { mode: true, refs: ["refs/heads/a"] })).toEqual({ shown: 2, total: 5 })
    // The current branch ticked as well (it was ticked before being checked out) is not counted twice.
    expect(graphRefCounts(tree, { mode: true, refs: ["refs/heads/a", "refs/heads/main"] })).toEqual({
      shown: 2,
      total: 5,
    })
  })

  it("has nothing to count without a tree, and no implicit branch when HEAD is detached", () => {
    expect(graphRefCounts(null, { mode: true, refs: ["refs/heads/a"] })).toEqual({ shown: 1, total: 0 })
    const detached: RefTree = { ...tree, branches: tree.branches.map((b) => ({ ...b, current: false })) }
    expect(graphRefCounts(detached, { mode: true, refs: [] })).toEqual({ shown: 0, total: 5 })
  })
})

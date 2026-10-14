import { describe, expect, it } from "vitest"
import { DEFAULT_GRAPH_OPTIONS, parseGraphOptions } from "./graphOptions"

describe("parseGraphOptions", () => {
  it("defaults to all ancestors, ring, dim, the author mark and branch first", () => {
    expect(parseGraphOptions(null)).toEqual({ scope: "all", ring: true, dim: true, authorMark: true, branchFirst: true })
    expect(DEFAULT_GRAPH_OPTIONS.dim).toBe(true)
  })

  it("reads a stored choice and fills gaps", () => {
    expect(parseGraphOptions('{"scope":"first-parent","dim":false}')).toEqual({
      scope: "first-parent",
      ring: true,
      dim: false,
      authorMark: true,
      branchFirst: true,
    })
    // v0.18.1: a pre-authorMark store keeps its choices and gets the default.
    expect(parseGraphOptions('{"authorMark":false}')).toEqual({ ...DEFAULT_GRAPH_OPTIONS, authorMark: false })
    // v0.21.7: a store from before branchFirst gets it on; off is kept.
    expect(parseGraphOptions('{"dim":true}').branchFirst).toBe(true)
    expect(parseGraphOptions('{"branchFirst":false}').branchFirst).toBe(false)
  })

  it("ignores garbage", () => {
    expect(parseGraphOptions("{not json")).toEqual(DEFAULT_GRAPH_OPTIONS)
    expect(parseGraphOptions('{"scope":"sideways","ring":"yes","authorMark":"no"}')).toEqual(DEFAULT_GRAPH_OPTIONS)
  })
})

import { describe, expect, it } from "vitest"
import { DEFAULT_GRAPH_OPTIONS, parseGraphOptions } from "./graphOptions"

describe("parseGraphOptions", () => {
  it("defaults to all ancestors, ring and dim", () => {
    expect(parseGraphOptions(null)).toEqual({ scope: "all", ring: true, dim: true })
    expect(DEFAULT_GRAPH_OPTIONS.dim).toBe(true)
  })

  it("reads a stored choice and fills gaps", () => {
    expect(parseGraphOptions('{"scope":"first-parent","dim":false}')).toEqual({ scope: "first-parent", ring: true, dim: false })
  })

  it("ignores garbage", () => {
    expect(parseGraphOptions("{not json")).toEqual(DEFAULT_GRAPH_OPTIONS)
    expect(parseGraphOptions('{"scope":"sideways","ring":"yes"}')).toEqual(DEFAULT_GRAPH_OPTIONS)
  })
})

import { describe, expect, it } from "vitest"
import { CODE_WRAP_KEY, getCodeWrap, parseCodeWrap, setCodeWrap } from "./codeWrap"

// Wrap lines (v0.18.8): one remembered switch under pg.diffWrap, off by
// default so the no-wrap assertions of diff-view.spec keep their meaning.

describe("parseCodeWrap", () => {
  it("is off by default", () => {
    expect(parseCodeWrap(null)).toBe(false)
    expect(parseCodeWrap("")).toBe(false)
    expect(parseCodeWrap("0")).toBe(false)
    expect(parseCodeWrap("false")).toBe(false)
  })

  it("reads the stored switch tolerantly", () => {
    expect(parseCodeWrap("1")).toBe(true)
    expect(parseCodeWrap("true")).toBe(true)
    expect(parseCodeWrap(" TRUE ")).toBe(true)
  })

  it("ignores garbage", () => {
    expect(parseCodeWrap("yes")).toBe(false)
    expect(parseCodeWrap("{not json")).toBe(false)
  })
})

describe("the store", () => {
  it("starts off, remembers the switch and has a stable key", () => {
    expect(CODE_WRAP_KEY).toBe("pg.diffWrap")
    expect(getCodeWrap()).toBe(false)
    setCodeWrap(true)
    expect(getCodeWrap()).toBe(true)
    setCodeWrap(false)
    expect(getCodeWrap()).toBe(false)
  })
})

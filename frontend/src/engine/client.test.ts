import { describe, expect, it } from "vitest"
import { changeSequenceOf, changeVersionWasObserved } from "./client"

describe("watcher change versions", () => {
  it("compares only the monotonic sequence, not the low-bit change kind (v0.18.18)", () => {
    expect(changeSequenceOf(10)).toBe(2) // refs
    expect(changeVersionWasObserved(9, 10)).toBe(true) // same sequence, status
    expect(changeVersionWasObserved(10, 10)).toBe(true)
    expect(changeVersionWasObserved(13, 10)).toBe(false) // an external later status write
  })
})

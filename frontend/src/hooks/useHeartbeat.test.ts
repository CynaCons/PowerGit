import { describe, expect, it } from "vitest"
import { frameAge } from "./useHeartbeat"

describe("frameAge (v0.14.2 paint heartbeat)", () => {
  it("reports how long ago the last frame painted while visible", () => {
    expect(frameAge(5000, 4980, true)).toBe(20)
  })
  it("is null while the window is hidden, where frames legitimately stop", () => {
    expect(frameAge(5000, 0, false)).toBeNull()
  })
  it("never goes negative", () => {
    expect(frameAge(100, 200, true)).toBe(0)
  })
})

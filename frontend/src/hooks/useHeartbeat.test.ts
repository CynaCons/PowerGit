import { describe, expect, it } from "vitest"
import { PROBE_OPACITIES, frameAge, nextProbeOpacity, pulseProbe } from "./useHeartbeat"

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

describe("paint probe pixel (v0.15.6 Ubuntu freeze taskforce)", () => {
  it("alternates between 1 and 0.99 so every beat is a real change", () => {
    expect(PROBE_OPACITIES).toEqual(["1", "0.99"])
    expect(nextProbeOpacity("1")).toBe("0.99")
    expect(nextProbeOpacity("0.99")).toBe("1")
  })
  it("recovers from any other value by going back to 1", () => {
    expect(nextProbeOpacity("")).toBe("1")
    expect(nextProbeOpacity("0.5")).toBe("1")
  })
  it("pulseProbe writes the new opacity to the element on each beat", () => {
    const el = { style: { opacity: "1" } }
    const seen: string[] = []
    for (let i = 0; i < 4; i++) seen.push(pulseProbe(el))
    expect(seen).toEqual(["0.99", "1", "0.99", "1"])
    // Never the same value twice in a row: the change cannot be elided.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1])
  })
})

import { describe, expect, it } from "vitest"
import { clampWidth, DEFAULT_WIDTHS, loadWidths, saveWidths, STORAGE_KEY } from "./gridColumns"

function memory(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  }
}

describe("grid column widths (v0.14.3)", () => {
  it("defaults when nothing is stored or the value is garbage", () => {
    const s = memory()
    expect(loadWidths(s)).toEqual(DEFAULT_WIDTHS)
    // v0.18.1: the disc needs the room; a user-set width still wins.
    expect(DEFAULT_WIDTHS.author).toBe(154)
    s.setItem(STORAGE_KEY, "{nope")
    expect(loadWidths(s)).toEqual(DEFAULT_WIDTHS)
    s.setItem(STORAGE_KEY, JSON.stringify({ author: "wide", sha: 60 }))
    expect(loadWidths(s)).toEqual({ ...DEFAULT_WIDTHS, sha: 60 })
  })

  it("round-trips and clamps", () => {
    const s = memory()
    saveWidths({ graph: 300, author: 10, date: 5000, sha: 90 }, s)
    expect(loadWidths(s)).toEqual({ graph: 300, author: 40, date: 1200, sha: 90 })
    expect(clampWidth("graph", 3)).toBe(24)
    expect(clampWidth("date", 100.6)).toBe(101)
  })
})

import { describe, expect, it } from "vitest"
import { DRAW_MARGIN, nextDrawWindow, windowGeometry } from "./gridGeometry"

// v0.20.9, owner's Ubuntu benchmark: the graph canvas was redrawn on every
// 28 px scroll step. It now keeps a window of rows around the rendered range
// and redraws only when the rendered range leaves it.
describe("nextDrawWindow", () => {
  it("opens a window with the margin on both sides, clamped to the list", () => {
    expect(nextDrawWindow(null, 0, 40, 12000)).toEqual({ from: 0, to: 40 + 2 })
    const first = nextDrawWindow({ from: 0, to: 42 }, 10, 50, 12000)
    expect(first).toEqual({ from: 10 - DRAW_MARGIN < 0 ? 0 : 10 - DRAW_MARGIN, to: 50 + DRAW_MARGIN })
    expect(nextDrawWindow({ from: 11900, to: 11960 }, 11950, 11999, 12000)).toEqual({
      from: 11950 - DRAW_MARGIN,
      to: 11999,
    })
  })

  it("keeps the same window object while the rendered range stays inside it", () => {
    const window = { from: 100, to: 200 }
    for (let first = 100; first + 40 <= 200; first++) {
      expect(nextDrawWindow(window, first, first + 40, 12000)).toBe(window)
    }
  })

  it("moves on with a margin when a continuous scroll leaves the window", () => {
    expect(nextDrawWindow({ from: 100, to: 200 }, 161, 201, 12000)).toEqual({
      from: 161 - DRAW_MARGIN,
      to: 201 + DRAW_MARGIN,
    })
  })

  it("takes a tight window after a jump that lands outside the old one", () => {
    expect(nextDrawWindow({ from: 100, to: 200 }, 5000, 5040, 12000)).toEqual({ from: 4998, to: 5042 })
  })

  it("re-opens when the list shrank under the window, and says nothing for an empty list", () => {
    expect(nextDrawWindow({ from: 0, to: 200 }, 0, 40, 100)).toEqual({ from: 0, to: 40 + DRAW_MARGIN })
    expect(nextDrawWindow(null, 0, 0, 0)).toBeNull()
  })
})

describe("windowGeometry", () => {
  const band = (i: number) => (i >= 0 && i < 1000 ? { index: i, start: i * 28, size: 28 } : undefined)

  it("covers the window from its first row's top to its last row's bottom, with a neighbour each side", () => {
    const g = windowGeometry({ from: 10, to: 20 }, band)
    expect(g.top).toBe(280)
    expect(g.height).toBe(11 * 28)
    expect(g.bands.map((b) => b.index)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21])
  })

  it("has no neighbour past the ends of the list", () => {
    expect(windowGeometry({ from: 0, to: 2 }, band).bands.map((b) => b.index)).toEqual([0, 1, 2, 3])
  })
})

import { describe, expect, it } from "vitest"
import {
  COMMIT_DIALOG_MARGIN,
  MIN_COMMIT_DIALOG_HEIGHT,
  MIN_COMMIT_DIALOG_WIDTH,
  clampRect,
  clampSize,
  parseStoredSize,
  resizeRect,
  type Rect,
} from "./dialogSize"

const viewport = { width: 1280, height: 720 }
const start: Rect = { left: 200, top: 100, width: 700, height: 500 }

describe("resizeRect", () => {
  it("the dragged edge follows the pointer and the opposite edge stays put", () => {
    expect(resizeRect(start, "se", 50, 30, viewport)).toEqual({ left: 200, top: 100, width: 750, height: 530 })
    expect(resizeRect(start, "nw", -50, -30, viewport)).toEqual({ left: 150, top: 70, width: 750, height: 530 })
    expect(resizeRect(start, "e", 50, 999, viewport)).toEqual({ ...start, width: 750 })
    expect(resizeRect(start, "w", 50, 999, viewport)).toEqual({ ...start, left: 250, width: 650 })
    expect(resizeRect(start, "s", 999, 30, viewport)).toEqual({ ...start, height: 530 })
    expect(resizeRect(start, "n", 999, 30, viewport)).toEqual({ ...start, top: 130, height: 470 })
    expect(resizeRect(start, "ne", 50, -30, viewport)).toEqual({ left: 200, top: 70, width: 750, height: 530 })
    expect(resizeRect(start, "sw", -50, 30, viewport)).toEqual({ left: 150, top: 100, width: 750, height: 530 })
  })

  it("stops at the minimum size, anchored on the opposite edge", () => {
    const small = resizeRect(start, "se", -1000, -1000, viewport)
    expect(small).toEqual({ left: 200, top: 100, width: MIN_COMMIT_DIALOG_WIDTH, height: MIN_COMMIT_DIALOG_HEIGHT })
    const fromCorner = resizeRect(start, "nw", 1000, 1000, viewport)
    expect(fromCorner.width).toBe(MIN_COMMIT_DIALOG_WIDTH)
    expect(fromCorner.left + fromCorner.width).toBe(start.left + start.width)
    expect(fromCorner.top + fromCorner.height).toBe(start.top + start.height)
  })

  it("stops at the viewport margin on every side", () => {
    const grown = resizeRect(start, "se", 5000, 5000, viewport)
    expect(grown.left + grown.width).toBe(viewport.width - COMMIT_DIALOG_MARGIN)
    expect(grown.top + grown.height).toBe(viewport.height - COMMIT_DIALOG_MARGIN)
    const pulled = resizeRect(start, "nw", -5000, -5000, viewport)
    expect(pulled.left).toBe(COMMIT_DIALOG_MARGIN)
    expect(pulled.top).toBe(COMMIT_DIALOG_MARGIN)
  })
})

describe("clamping", () => {
  it("clampSize keeps a remembered size inside a smaller viewport", () => {
    expect(clampSize({ width: 3000, height: 2000 }, viewport)).toEqual({ width: 1248, height: 688 })
    expect(clampSize({ width: 10, height: 10 }, viewport)).toEqual({
      width: MIN_COMMIT_DIALOG_WIDTH,
      height: MIN_COMMIT_DIALOG_HEIGHT,
    })
  })

  it("clampRect moves a window back inside the margin", () => {
    expect(clampRect({ left: 900, top: 500, width: 600, height: 400 }, viewport)).toEqual({
      left: viewport.width - COMMIT_DIALOG_MARGIN - 600,
      top: viewport.height - COMMIT_DIALOG_MARGIN - 400,
      width: 600,
      height: 400,
    })
    expect(clampRect({ left: -50, top: -50, width: 600, height: 400 }, viewport)).toMatchObject({ left: 16, top: 16 })
  })
})

describe("parseStoredSize", () => {
  it("accepts a positive pair and rejects everything else", () => {
    expect(parseStoredSize(JSON.stringify({ width: 900, height: 600 }))).toEqual({ width: 900, height: 600 })
    for (const raw of [null, "", "junk", "{}", '{"width":"9","height":6}', '{"width":0,"height":6}', "[1,2]"]) {
      expect(parseStoredSize(raw)).toBeNull()
    }
  })
})

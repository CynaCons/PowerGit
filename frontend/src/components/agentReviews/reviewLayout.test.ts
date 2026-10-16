import { describe, expect, it } from "vitest"
import { clampReviewWidth, getReviewLayout, parseReviewWidth, REVIEW_PANES, setReviewLayout } from "./reviewLayout"

describe("review layout", () => {
  it.each(["files", "board"] as const)("defaults garbage %s widths", (pane) => {
    for (const raw of [null, "", "  ", "garbage", "NaN", "Infinity", "0", "-10", "{}"])
      expect(parseReviewWidth(raw, pane)).toBe(REVIEW_PANES[pane].defaultValue)
    expect(parseReviewWidth("281.5", pane)).toBe(281.5)
  })
  it.each(["files", "board"] as const)("clamps %s to its minimum and grid ratio", (pane) => {
    const { min, maxRatio, defaultValue } = REVIEW_PANES[pane]
    expect(clampReviewWidth(1, pane, 1200)).toBe(min)
    expect(clampReviewWidth(10000, pane, 1200)).toBe(1200 * maxRatio)
    expect(clampReviewWidth(defaultValue, pane, 1200)).toBe(defaultValue)
    expect(clampReviewWidth(NaN, pane, 1200)).toBe(defaultValue)
    expect(clampReviewWidth(10000, pane, 100)).toBe(min)
  })
  it("keeps the two pane choices independent", () => {
    const before = getReviewLayout()
    setReviewLayout("files", 280)
    setReviewLayout("board", 410)
    expect(getReviewLayout()).toEqual({ files: 280, board: 410 })
    expect(REVIEW_PANES.files.key).toBe("pg.reviewFilesWidth")
    expect(REVIEW_PANES.board.key).toBe("pg.reviewBoardWidth")
    setReviewLayout("files", before.files)
    setReviewLayout("board", before.board)
  })
})

import { describe, expect, it } from "vitest"
import { getCodeWrap } from "../codeWrap"
import { DEFAULT_REVIEW_DIFF, getReviewDiff, parseReviewDiff, REVIEW_DIFF_KEY, setReviewDiff } from "./reviewDiffView"

// v0.21.9: the review screen's diff options are its own, remembered under
// pg.reviewDiff, apart from the other diff views' pg.diffWrap.

describe("review diff view", () => {
  it("defaults to three lines of context and wrapped lines", () => {
    expect(parseReviewDiff(null)).toEqual(DEFAULT_REVIEW_DIFF)
    expect(DEFAULT_REVIEW_DIFF).toEqual({ options: { context: 3, ws: false, full: false }, wrap: true })
  })

  it("reads what it stored, and odd fields take their defaults", () => {
    expect(parseReviewDiff('{"context":10,"full":true,"wrap":false}')).toEqual({
      options: { context: 10, ws: false, full: true },
      wrap: false,
    })
    expect(parseReviewDiff('{"context":-1,"full":"yes","wrap":1}')).toEqual(DEFAULT_REVIEW_DIFF)
    expect(parseReviewDiff("not json")).toEqual(DEFAULT_REVIEW_DIFF)
  })

  it("has its own key and leaves the shared wrap alone", () => {
    const shared = getCodeWrap()
    setReviewDiff({ wrap: false, options: { context: 6, ws: true, full: false } })
    expect(getReviewDiff()).toEqual({ options: { context: 6, ws: false, full: false }, wrap: false })
    expect(REVIEW_DIFF_KEY).toBe("pg.reviewDiff")
    expect(getCodeWrap()).toBe(shared)
    setReviewDiff(DEFAULT_REVIEW_DIFF)
  })
})

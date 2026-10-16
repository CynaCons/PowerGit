// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { reviewOpenPlan } from "./reviewOpen"

const item = (repoId: string, root: string, sessionId = "s1") => ({
  repo: { id: repoId, root, name: "x" },
  session: { id: sessionId } as never,
})

describe("reviewOpenPlan", () => {
  it("opens in place when the review's repository is the window's one", () => {
    expect(reviewOpenPlan(item("r1", "C:\\dev\\x"), "r1")).toEqual({ action: "open", sessionId: "s1" })
  })

  it("switches the repository first when the review lives in another one", () => {
    expect(reviewOpenPlan(item("r2", "C:\\dev\\y"), "r1")).toEqual({
      action: "switch",
      root: "C:\\dev\\y",
      sessionId: "s1",
    })
  })

  it("switches with no repository open in this window", () => {
    expect(reviewOpenPlan(item("r1", "C:\\dev\\x"), null)).toEqual({
      action: "switch",
      root: "C:\\dev\\x",
      sessionId: "s1",
    })
  })

  it("matches repository ids exactly (a different id is a switch even with the same root)", () => {
    expect(reviewOpenPlan(item("r-other", "C:\\dev\\x"), "r1")).toEqual({
      action: "switch",
      root: "C:\\dev\\x",
      sessionId: "s1",
    })
  })
})

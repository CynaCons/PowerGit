import { describe, expect, it } from "vitest"
import { shouldSkipFetch } from "./useAutoFetch"

const base = { live: true, busy: false, hidden: false, state: "none" as const }

describe("shouldSkipFetch (v0.15.0 background fetch)", () => {
  it("fetches when the window is visible, the engine is live and nothing else runs", () => {
    expect(shouldSkipFetch(base)).toBe(false)
  })

  it("stays out of the way of the user's own work", () => {
    expect(shouldSkipFetch({ ...base, busy: true })).toBe(true)
    expect(shouldSkipFetch({ ...base, live: false })).toBe(true)
    expect(shouldSkipFetch({ ...base, hidden: true })).toBe(true)
  })

  it("never runs during a merge or a rebase", () => {
    expect(shouldSkipFetch({ ...base, state: "merging" })).toBe(true)
    expect(shouldSkipFetch({ ...base, state: "rebasing" })).toBe(true)
    expect(shouldSkipFetch({ ...base, state: "cherry-picking" })).toBe(true)
  })

  it("treats an engine that reports no state at all as idle", () => {
    expect(shouldSkipFetch({ ...base, state: undefined })).toBe(false)
  })
})

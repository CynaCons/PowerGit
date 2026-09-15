import { describe, expect, it } from "vitest"
import { checkState, toggleNames } from "./repoTreeChecks"

// Prototype docs/prototypes/branch-visibility.html, tab 4 A: a group's box
// is tri-state over its leaves; a click on a group ticks all or none; the
// checked-out branch is always ticked and never toggled.

const cur = "refs/heads/main"

describe("checkState", () => {
  it("is off, some, or on by how many leaves are ticked (the current branch counts)", () => {
    const set = new Set(["refs/heads/a"])
    expect(checkState(["refs/heads/a", "refs/heads/b"], set, cur)).toBe("some")
    expect(checkState(["refs/heads/a"], set, cur)).toBe(true)
    expect(checkState(["refs/heads/b"], set, cur)).toBe(false)
    expect(checkState(["refs/heads/main", "refs/heads/a"], set, cur)).toBe(true)
    expect(checkState(["refs/heads/main", "refs/heads/b"], set, cur)).toBe("some")
    expect(checkState([], set, cur)).toBe(false)
  })
})

describe("toggleNames", () => {
  it("ticks a leaf, unticks it again, never the current branch", () => {
    expect(toggleNames([], ["refs/heads/a"], cur)).toEqual(["refs/heads/a"])
    expect(toggleNames(["refs/heads/a"], ["refs/heads/a"], cur)).toEqual([])
    expect(toggleNames(["refs/heads/a"], [cur], cur)).toEqual(["refs/heads/a"])
  })

  it("ticks a whole group unless every leaf is on, then unticks the whole group", () => {
    const group = ["refs/remotes/origin/a", "refs/remotes/origin/b"]
    const some = toggleNames(["refs/remotes/origin/a"], group, cur)
    expect(some.sort()).toEqual(group)
    expect(toggleNames(some, group, cur)).toEqual([])
    // Other ticks are untouched.
    expect(toggleNames(["refs/tags/v1", ...group], group, cur)).toEqual(["refs/tags/v1"])
  })
})

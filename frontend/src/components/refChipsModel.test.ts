import { beforeEach, describe, expect, it } from "vitest"
import {
  CHIP_GAP,
  CHIP_GLYPH,
  CHIP_PADDING,
  chipWidth,
  foldRefs,
  kindOf,
  MORE_CHIP,
  orderRefs,
  resetChipMeasurer,
  textWidthOf,
} from "./refChipsModel"

const ctx = { current: "powergit", tagSet: new Set(["v0.18.2", "v0.18.1"]), remoteNames: ["origin", "upstream"] }

describe("ref chips model (v0.18.3)", () => {
  beforeEach(() => resetChipMeasurer())

  it("classifies HEAD, tags, stashes, remotes and locals", () => {
    expect(kindOf("HEAD", ctx)).toBe("head")
    expect(kindOf("v0.18.2", ctx)).toBe("tag")
    expect(kindOf("refs/stash", ctx)).toBe("stash")
    expect(kindOf("origin/powergit", ctx)).toBe("remote")
    expect(kindOf("feature/graph-refs", ctx)).toBe("local")
    // Without the remote list any slash counts as a remote (the tree may not be in yet).
    expect(kindOf("feature/graph-refs", { tagSet: new Set() })).toBe("remote")
  })

  it("orders HEAD, the checked-out branch and its remotes, then every other local with its own remotes, the orphan remotes, tags", () => {
    // Owner: "When my head is on a commit that has both local and remote
    // branches, I shall see all these on the commit."
    const refs = [
      "v0.18.2",
      "upstream/powergit",
      "release/0.18",
      "origin/powergit",
      "powergit",
      "HEAD",
      "origin/hotfix",
    ]
    expect(orderRefs(refs, ctx)).toEqual([
      "HEAD",
      "powergit",
      "origin/powergit",
      "upstream/powergit",
      "release/0.18",
      "origin/hotfix",
      "v0.18.2",
    ])
  })

  it("pairs a remote with its local through a slash in the branch name and keeps stashes last", () => {
    const refs = ["origin/feature/x", "feature/x", "refs/stash", "v0.18.1", "b"]
    expect(orderRefs(refs, ctx)).toEqual(["b", "feature/x", "origin/feature/x", "v0.18.1", "refs/stash"])
  })

  it("folds by width, keeping room for the +n chip, never fewer than one chip", () => {
    const widthOf = () => 40
    const ordered = ["a", "b", "c", "d"]
    // 40 + (4+40) + (4+40) = 128 for three, plus 4 + 26 for the +1 chip = 158.
    expect(foldRefs(ordered, 160, widthOf)).toEqual({ shown: ["a", "b", "c"], hidden: ["d"] })
    expect(foldRefs(ordered, 150, widthOf)).toEqual({ shown: ["a", "b"], hidden: ["c", "d"] })
    // Everything fits: 40 + 44 × 3 = 172, no +n needed.
    expect(foldRefs(ordered, 172, widthOf)).toEqual({ shown: ordered, hidden: [] })
    // Three chips and "+1" need 158: at 156 the third goes into the fold too.
    expect(foldRefs(ordered, 156, widthOf)).toEqual({ shown: ["a", "b"], hidden: ["c", "d"] })
    // Too narrow for anything: the first chip still shows.
    expect(foldRefs(ordered, 10, widthOf)).toEqual({ shown: ["a"], hidden: ["b", "c", "d"] })
    expect(foldRefs([], 100, widthOf)).toEqual({ shown: [], hidden: [] })
    // No budget: nothing folds (the Commit tab).
    expect(foldRefs(ordered, Infinity, widthOf)).toEqual({ shown: ordered, hidden: [] })
    expect(CHIP_GAP + MORE_CHIP).toBe(30)
  })

  it("measures with the fallback when there is no canvas, once per name", () => {
    // vitest runs in node: no document, so the fallback rule applies.
    const w = textWidthOf("powergit")
    expect(w).toBeCloseTo(8 * 6.2)
    expect(textWidthOf("powergit")).toBe(w)
    expect(chipWidth("powergit", "local")).toBeCloseTo(w + CHIP_PADDING + CHIP_GLYPH)
    expect(chipWidth("HEAD", "head")).toBeCloseTo(4 * 6.2 + CHIP_PADDING)
  })
})

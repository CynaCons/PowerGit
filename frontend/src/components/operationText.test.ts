import { describe, expect, it } from "vitest"
import type { RepoOperation, RepoStatus } from "../engine/types"
import { operationCaption, operationHeadline, sequencerOpOf } from "./operationText"

function status(patch: Partial<RepoStatus> = {}, op: Partial<RepoOperation> | null = null): RepoStatus {
  return {
    branch: "main",
    unstagedCount: 0,
    stagedCount: 0,
    unstaged: [],
    staged: [],
    ahead: null,
    behind: null,
    upstream: null,
    state: "none",
    operation: op
      ? {
          kind: "merging",
          headName: null,
          onto: null,
          ontoName: null,
          step: null,
          total: null,
          stoppedSha: null,
          interactive: false,
          message: null,
          ...op,
        }
      : null,
    conflicts: null,
    ...patch,
  }
}

describe("operationHeadline", () => {
  // The engine reports the CURRENT branch as headName during a merge and
  // the incoming side as ontoName (the name of MERGE_HEAD). Reading
  // headName produced "Merging 'main' into main" in the app (v0.15.0).
  it("names the incoming branch when merging, not the current one", () => {
    const s = status({ state: "merging" }, { kind: "merging", headName: "main", onto: "1a2b3c4d", ontoName: "topic" })
    expect(operationHeadline(s)).toBe("Merging 'topic' into main")
  })

  it("falls back to the commit when the merged side has no ref", () => {
    const s = status({ state: "merging" }, { kind: "merging", headName: "main", onto: "1a2b3c4d5e6f", ontoName: null })
    expect(operationHeadline(s)).toBe("Merging '1a2b3c4' into main")
  })

  it("names the branch being rewritten and its target when rebasing, with the step", () => {
    const s = status(
      { state: "rebasing", branch: "feature" },
      { kind: "rebasing", headName: "feature", onto: "9f8e7d6c", ontoName: "main", step: 2, total: 5 },
    )
    expect(operationHeadline(s)).toBe("Rebasing feature onto main (step 2 of 5)")
  })

  it("names the stopped commit for cherry-pick and revert", () => {
    const c = status({ state: "cherry-picking" }, { kind: "cherry-picking", stoppedSha: "abcdef1234" })
    expect(operationHeadline(c)).toBe("Cherry-picking abcdef1")
    const r = status({ state: "reverting" }, { kind: "reverting", stoppedSha: "abcdef1234" })
    expect(operationHeadline(r)).toBe("Reverting abcdef1")
  })

  it("says nothing when nothing is in progress", () => {
    expect(operationHeadline(status())).toBe("")
  })
})

describe("operationCaption and sequencerOpOf", () => {
  it("captions the status bar with the state and the step", () => {
    expect(operationCaption(null)).toBeNull()
    expect(operationCaption(status())).toBeNull()
    expect(operationCaption(status({ state: "merging" }))).toBe("MERGING")
    expect(operationCaption(status({ state: "rebasing" }, { kind: "rebasing", step: 2, total: 5 }))).toBe("REBASING 2/5")
  })

  it("routes continue and abort to the sequencer only for the sequencer's own operations", () => {
    expect(sequencerOpOf(status({ state: "rebasing" }))).toBe("rebase")
    expect(sequencerOpOf(status({ state: "cherry-picking" }))).toBe("cherry-pick")
    expect(sequencerOpOf(status({ state: "reverting" }))).toBe("revert")
    // A merge is continued with a commit, not with `git merge --continue`.
    expect(sequencerOpOf(status({ state: "merging" }))).toBeNull()
    expect(sequencerOpOf(status())).toBeNull()
  })
})

import { describe, expect, it } from "vitest"
import { fileResetPlan, isUntracked, lineResetPlan, type BrowseRow } from "./browseReset"

// v0.15.5. The Browse Diff tab shows three different diffs and the same
// "Reset" gesture means a different git operation on each. Getting it wrong
// destroys work the user cannot see, so the rules are pinned here rather
// than left to whoever next edits the menu.

const worktree: BrowseRow = { kind: "worktree" }
const index: BrowseRow = { kind: "index" }
const commit: BrowseRow = { kind: "commit", sha: "a1b2c3d" }

describe("file reset", () => {
  it("a Working directory row restores from the index and says staged work survives", () => {
    const plan = fileResetPlan(worktree, "src/App.tsx", false)
    expect(plan.scope).toBe("worktree")
    expect(plan.label).toBe("Reset unstaged changes…")
    expect(plan.confirm.text).toContain("index")
    expect(plan.confirm.text).toContain("staged is kept")
    expect(plan.confirm.destructive).toBe(true)
  })

  it("an Index row unstages and says the file on disk is untouched", () => {
    const plan = fileResetPlan(index, "src/App.tsx", false)
    expect(plan.scope).toBe("index")
    expect(plan.label).toBe("Reset staged changes…")
    expect(plan.confirm.confirmLabel).toBe("Unstage")
    expect(plan.confirm.text).toContain("not touched")
    // Nothing is lost: the changes only move back to the other row.
    expect(plan.confirm.destructive).toBe(false)
  })

  it("neither working-directory scope is ever the whole way to HEAD", () => {
    // The bug this guards: ResetFiles' default runs `reset HEAD` +
    // `checkout HEAD`, which on a Working directory row throws away staged
    // changes that row never displayed.
    expect(fileResetPlan(worktree, "f", false).scope).not.toBe("head")
    expect(fileResetPlan(index, "f", false).scope).not.toBe("head")
  })

  it("an untracked file gets a clearly different confirmation", () => {
    const plan = fileResetPlan(worktree, "src/new.ts", true)
    expect(plan.confirm.title).toBe("Delete untracked file")
    expect(plan.confirm.confirmLabel).toBe("Delete file")
    expect(plan.confirm.text).toContain("cannot be recovered")
    expect(plan.confirm.destructive).toBe(true)
  })

  it("a commit says Undo, not Reset, and promises history is untouched", () => {
    const plan = fileResetPlan(commit, "src/App.tsx", false)
    expect(plan.scope).toBeNull()
    expect(plan.label).toBe("Undo this file's changes…")
    expect(plan.confirm.text).toContain("a1b2c3d")
    expect(plan.confirm.text).toContain("staged")
    expect(plan.confirm.text).toContain("History is not rewritten")
  })
})

describe("line reset", () => {
  it("counts the lines in the label", () => {
    expect(lineResetPlan(worktree, "f", 1).label).toBe("Reset selected line…")
    expect(lineResetPlan(worktree, "f", 3).label).toBe("Reset selected 3 lines…")
    expect(lineResetPlan(commit, "f", 2).label).toBe("Undo selected 2 lines…")
  })

  it("maps each row to the apply that matches the diff on screen", () => {
    expect(lineResetPlan(worktree, "f", 1).action).toBe("reset")
    expect(lineResetPlan(index, "f", 1).action).toBe("unstage")
    expect(lineResetPlan(commit, "f", 1).action).toBe("undo")
  })

  it("names the file and what survives", () => {
    expect(lineResetPlan(worktree, "src/App.tsx", 2).confirm.text).toContain("src/App.tsx")
    expect(lineResetPlan(worktree, "f", 2).confirm.text).toContain("staged for this file is kept")
    expect(lineResetPlan(index, "f", 2).confirm.text).toContain("not touched")
  })
})

describe("untracked detection", () => {
  it('reads the engine status letter, which is "U" for untracked', () => {
    expect(isUntracked("U")).toBe(true)
    expect(isUntracked("M")).toBe(false)
    expect(isUntracked("A")).toBe(false)
    expect(isUntracked(undefined)).toBe(false)
  })
})

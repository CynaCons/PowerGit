import { describe, expect, it } from "vitest"
import type { StatusFile } from "../engine"
import {
  buildFileMenu,
  excludePattern,
  fullPath,
  resetScopeOf,
  type FileMenuInput,
  type FileMenuNode,
} from "./commitFileMenuModel"

// Owner (v0.16.0): "on the left we have the files staged and unstaged. We need
// functional parity with what GE has. Should be able to right click on my
// files and do operations on them." The item set, its order and its rules
// are Git Extensions' FileStatusList.ContextMenu.cs (UpdateStatusOfMenuItems)
// for the Unstaged (work tree) and Staged (index) lists of FormCommit.

const modified = (path = "a.txt"): StatusFile => ({ path, status: "M", staged: false })
const untracked = (path = "new.txt"): StatusFile => ({ path, status: "U", staged: false })
const deleted = (path = "gone.txt"): StatusFile => ({ path, status: "D", staged: false })
const hiddenSkip = (path = "skipped.txt"): StatusFile => ({ path, status: "S", staged: false, skipWorktree: true })

const base: FileMenuInput = {
  staged: false,
  files: [modified()],
  listCount: 3,
  shell: true,
  view: { skipWorktree: false, assumeUnchanged: false },
}
const build = (patch: Partial<FileMenuInput> = {}) => buildFileMenu({ ...base, ...patch })
const ids = (nodes: FileMenuNode[]) => nodes.map((n) => n.id)
const find = (nodes: FileMenuNode[], id: string) => nodes.find((n) => n.id === id)

describe("buildFileMenu", () => {
  it("lists the Git Extensions groups in order for one modified unstaged file", () => {
    const nodes = build()
    expect(ids(nodes)).toEqual([
      "ctx-stage-selected",
      "ctx-stage-all",
      "ctx-reset-file",
      "ctx-difftool",
      "ctx-open-file",
      "ctx-open-with",
      "ctx-edit-file",
      "ctx-move-file",
      "ctx-delete-file",
      "ctx-copy-path",
      "ctx-show-in-folder",
      "ctx-ignore-file",
      "ctx-exclude-file",
      "ctx-skip-worktree",
      "ctx-assume-unchanged",
      "ctx-stop-tracking",
      "ctx-show-skip-worktree",
      "ctx-show-assume-unchanged",
    ])
    // GE's separators: sepGit, sepFile, sepIgnore, plus the view group.
    expect(nodes.filter((n) => n.divider).map((n) => n.id)).toEqual([
      "ctx-difftool",
      "ctx-copy-path",
      "ctx-ignore-file",
      "ctx-show-skip-worktree",
    ])
    expect(nodes.every((n) => n.icon !== undefined)).toBe(true)
    expect(nodes.every((n) => !n.disabled)).toBe(true)
    expect(find(nodes, "ctx-stage-selected")?.label).toBe("Stage file")
    expect(find(nodes, "ctx-stage-selected")?.shortcut).toBe("S")
  })

  it("offers Index and HEAD as reset targets on the unstaged list, HEAD only on the staged list", () => {
    expect(ids(find(build(), "ctx-reset-file")?.children ?? [])).toEqual(["ctx-reset-index", "ctx-reset-head"])
    expect(ids(find(build({ staged: true }), "ctx-reset-file")?.children ?? [])).toEqual(["ctx-reset-head"])
    expect(resetScopeOf("ctx-reset-index")).toBe("worktree")
    expect(resetScopeOf("ctx-reset-head")).toBe("head")
  })

  it("keeps the ignore group off the staged list, like GE (canIgnoreFiles needs a work-tree row)", () => {
    const nodes = build({ staged: true, files: [{ path: "a.txt", status: "M", staged: true }] })
    expect(ids(nodes)).not.toContain("ctx-ignore-file")
    expect(ids(nodes)).not.toContain("ctx-exclude-file")
    expect(ids(nodes)).not.toContain("ctx-skip-worktree")
    expect(ids(nodes)).not.toContain("ctx-assume-unchanged")
    expect(find(nodes, "ctx-stage-selected")?.label).toBe("Unstage file")
    expect(find(nodes, "ctx-stage-selected")?.shortcut).toBe("U")
    expect(find(nodes, "ctx-stage-all")?.label).toBe("Unstage all")
    // Stop tracking is not gated on the list.
    expect(ids(nodes)).toContain("ctx-stop-tracking")
  })

  it("hides what needs a tracked file when the selection is untracked", () => {
    const nodes = build({ files: [untracked()] })
    expect(ids(nodes)).not.toContain("ctx-skip-worktree")
    expect(ids(nodes)).not.toContain("ctx-assume-unchanged")
    expect(ids(nodes)).not.toContain("ctx-move-file")
    expect(ids(nodes)).not.toContain("ctx-stop-tracking")
    // Ignoring and excluding are exactly for untracked files; reset deletes them (SRS-ENG-041).
    expect(find(nodes, "ctx-ignore-file")?.disabled).toBeFalsy()
    expect(find(nodes, "ctx-exclude-file")?.disabled).toBeFalsy()
    expect(find(nodes, "ctx-reset-file")?.disabled).toBeFalsy()
  })

  it("pluralises and disables the one-file items for a multi-selection", () => {
    const nodes = build({ files: [modified("a.txt"), untracked("b.txt")] })
    expect(find(nodes, "ctx-stage-selected")?.label).toBe("Stage 2 files")
    expect(find(nodes, "ctx-delete-file")?.label).toBe("Delete 2 files…")
    expect(find(nodes, "ctx-reset-file")?.label).toBe("Reset 2 files to")
    expect(find(nodes, "ctx-copy-path")?.label).toBe("Copy paths")
    expect(find(nodes, "ctx-exclude-file")?.label).toBe("Add 2 files to .git/info/exclude…")
    for (const id of [
      "ctx-difftool",
      "ctx-open-file",
      "ctx-open-with",
      "ctx-edit-file",
      "ctx-move-file",
      "ctx-ignore-file",
    ]) {
      expect(find(nodes, id)?.disabled, id).toBe(true)
      expect(find(nodes, id)?.hint, id).toBe("One file at a time.")
    }
    // A tracked file is in the selection, so the flags apply to it.
    expect(ids(nodes)).toContain("ctx-skip-worktree")
    expect(find(nodes, "ctx-stop-tracking")?.disabled).toBe(true)
  })

  it("does not offer to open, edit or delete what is already gone", () => {
    const nodes = build({ files: [deleted()] })
    expect(ids(nodes)).not.toContain("ctx-open-file")
    expect(ids(nodes)).not.toContain("ctx-open-with")
    expect(ids(nodes)).not.toContain("ctx-edit-file")
    expect(ids(nodes)).not.toContain("ctx-move-file")
    expect(find(nodes, "ctx-delete-file")?.disabled).toBe(true)
    expect(find(nodes, "ctx-show-in-folder")?.disabled).toBe(true)
  })

  it("check marks follow the file's index bits and the view toggles", () => {
    const off = build()
    expect(find(off, "ctx-skip-worktree")?.checked).toBe(false)
    expect(find(off, "ctx-assume-unchanged")?.checked).toBe(false)
    expect(find(off, "ctx-show-skip-worktree")?.checked).toBe(false)

    const on = build({
      files: [{ path: "a.txt", status: "s", staged: false, skipWorktree: true, assumeUnchanged: true }],
      view: { skipWorktree: true, assumeUnchanged: false },
    })
    expect(find(on, "ctx-skip-worktree")?.checked).toBe(true)
    expect(find(on, "ctx-assume-unchanged")?.checked).toBe(true)
    expect(find(on, "ctx-show-skip-worktree")?.checked).toBe(true)
    expect(find(on, "ctx-show-assume-unchanged")?.checked).toBe(false)
  })

  it("will not stage, reset or rename a hidden (flagged) row, since git refuses it", () => {
    const nodes = build({ files: [hiddenSkip()] })
    expect(find(nodes, "ctx-stage-selected")?.disabled).toBe(true)
    expect(find(nodes, "ctx-stage-selected")?.hint).toContain("clear the flag")
    expect(find(nodes, "ctx-reset-file")?.disabled).toBe(true)
    expect(ids(nodes)).not.toContain("ctx-move-file")
    // The way back is right there, checked.
    expect(find(nodes, "ctx-skip-worktree")?.checked).toBe(true)
  })

  it("hides Show in folder outside the Tauri shell", () => {
    expect(ids(build({ shell: false }))).not.toContain("ctx-show-in-folder")
    expect(ids(build({ shell: true }))).toContain("ctx-show-in-folder")
  })

  it("disables Stage all on an empty list and the flags on a conflicted file", () => {
    expect(find(build({ listCount: 0 }), "ctx-stage-all")?.disabled).toBe(true)
    const conflict = build({ files: [{ path: "c.txt", status: "C", staged: false }] })
    expect(find(conflict, "ctx-skip-worktree")?.disabled).toBe(true)
    expect(find(conflict, "ctx-assume-unchanged")?.hint).toBe("Resolve the conflict first.")
  })
})

describe("paths", () => {
  it("anchors exclude patterns like GE does", () => {
    expect(excludePattern("dir/file.txt")).toBe("/dir/file.txt")
    expect(excludePattern("/already.txt")).toBe("/already.txt")
  })

  it("builds the full path in the root's separator style", () => {
    expect(fullPath("C:\\repo", "src/a.ts")).toBe("C:\\repo\\src\\a.ts")
    expect(fullPath("C:\\repo\\", "a.ts")).toBe("C:\\repo\\a.ts")
    expect(fullPath("/home/u/repo", "src/a.ts")).toBe("/home/u/repo/src/a.ts")
    expect(fullPath(null, "src/a.ts")).toBe("src/a.ts")
  })
})

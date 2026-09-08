import { describe, expect, it } from "vitest"
import { buildRevisionMenu, type MenuNode, type RevisionMenuInput } from "./revisionMenuModel"

const base: RevisionMenuInput = {
  sha: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
  subject: "second",
  artificial: false,
  refs: [],
  currentBranch: "main",
  localBranches: ["main", "topic"],
  tags: ["v1.0"],
  stagedCount: 0,
  otherSelectedSha: null,
  baseSha: null,
  webUrl: null,
  operation: "none",
}

const build = (patch: Partial<RevisionMenuInput> = {}) => buildRevisionMenu({ ...base, ...patch })
const ids = (nodes: MenuNode[]) => nodes.map((n) => n.id)
const find = (nodes: MenuNode[], id: string) => nodes.find((n) => n.id === id)

describe("buildRevisionMenu", () => {
  it("lists the Git Extensions groups in order", () => {
    expect(ids(build({ refs: ["topic", "v1.0"] }))).toEqual([
      "ctx-checkout",
      "ctx-merge",
      "ctx-rebase",
      "ctx-rebase-interactive",
      "ctx-reset",
      "ctx-create-branch",
      "ctx-create-tag",
      "ctx-delete-branch",
      "ctx-delete-tag",
      "ctx-cherry-pick",
      "ctx-revert",
      "ctx-fixup",
      "ctx-squash",
      "ctx-compare",
      "ctx-copy",
      "ctx-archive",
      "ctx-open-browser",
    ])
  })

  it("draws a separator above each group and never above the first item", () => {
    const nodes = build({ refs: ["topic"] })
    expect(nodes[0].divider).toBeFalsy()
    const dividers = nodes.filter((n) => n.divider).map((n) => n.id)
    expect(dividers).toEqual(["ctx-create-branch", "ctx-cherry-pick", "ctx-compare", "ctx-copy"])
  })

  it("carries the same shortcuts the toolbar shows", () => {
    const nodes = build({ refs: ["topic"] })
    expect(find(nodes, "ctx-checkout")?.shortcut).toBe("Ctrl+.")
    expect(find(nodes, "ctx-merge")?.shortcut).toBe("Ctrl+M")
    expect(find(nodes, "ctx-rebase")?.shortcut).toBe("Ctrl+Shift+E")
    expect(find(nodes, "ctx-create-branch")?.shortcut).toBe("Ctrl+B")
    expect(find(nodes, "ctx-create-tag")?.shortcut).toBe("Ctrl+T")
  })

  it("offers Merge only for a branch that is not the current one", () => {
    expect(find(build(), "ctx-merge")).toBeUndefined()
    expect(find(build({ refs: ["main", "HEAD"] }), "ctx-merge")).toBeUndefined()
    const merge = find(build({ refs: ["topic"] }), "ctx-merge")
    expect(merge?.label).toBe("Merge 'topic' into current branch…")
    expect(merge?.value).toBe("topic")
  })

  it("disables what a running operation forbids", () => {
    const nodes = build({ refs: ["topic"], operation: "rebasing" })
    for (const id of ["ctx-merge", "ctx-rebase", "ctx-rebase-interactive"]) {
      expect(find(nodes, id), id).toMatchObject({ disabled: true })
      expect(find(nodes, id)?.hint, id).toMatch(/operation in progress/i)
    }
    // Reset, copy and the rest stay usable.
    expect(find(nodes, "ctx-reset")?.disabled).toBeFalsy()
  })

  it("checkout needs a branch on the row; delete submenus list only what is there", () => {
    expect(find(build(), "ctx-checkout")?.disabled).toBe(true)
    expect(find(build({ refs: ["topic"] }), "ctx-checkout")?.disabled).toBe(false)
    expect(find(build(), "ctx-delete-branch")).toBeUndefined()
    expect(find(build(), "ctx-delete-tag")).toBeUndefined()

    const nodes = build({ refs: ["main", "topic", "v1.0"] })
    expect(ids(find(nodes, "ctx-delete-branch")!.children!)).toEqual([
      "ctx-delete-branch-main",
      "ctx-delete-branch-topic",
    ])
    // The checked-out branch is listed but cannot be deleted.
    expect(find(find(nodes, "ctx-delete-branch")!.children!, "ctx-delete-branch-main")?.disabled).toBe(true)
    expect(ids(find(nodes, "ctx-delete-tag")!.children!)).toEqual(["ctx-delete-tag-v1.0"])
  })

  it("reset is a submenu of the three modes", () => {
    expect(ids(find(build(), "ctx-reset")!.children!)).toEqual(["ctx-reset-soft", "ctx-reset-mixed", "ctx-reset-hard"])
    expect(find(build(), "ctx-reset")!.children!.map((c) => c.value)).toEqual(["soft", "mixed", "hard"])
  })

  it("fixup and squash need something staged", () => {
    expect(find(build(), "ctx-fixup")).toMatchObject({ disabled: true })
    expect(find(build(), "ctx-squash")?.hint).toMatch(/Stage the changes/)
    expect(find(build({ stagedCount: 2 }), "ctx-fixup")?.disabled).toBe(false)
    expect(find(build({ stagedCount: 2 }), "ctx-fixup")?.label).toContain("1a2b3c4")
  })

  it("compare enables the pair entries only once there is something to pair with", () => {
    const children = find(build(), "ctx-compare")!.children!
    expect(ids(children)).toEqual([
      "ctx-compare-head",
      "ctx-compare-worktree",
      "ctx-compare-selected",
      "ctx-compare-set-base",
      "ctx-compare-to-base",
    ])
    expect(find(children, "ctx-compare-selected")?.disabled).toBe(true)
    expect(find(children, "ctx-compare-to-base")?.disabled).toBe(true)

    const paired = find(build({ otherSelectedSha: "ffff000", baseSha: "abcdef0" }), "ctx-compare")!.children!
    expect(find(paired, "ctx-compare-selected")?.disabled).toBe(false)
    expect(find(paired, "ctx-compare-to-base")).toMatchObject({ disabled: false, label: "…to BASE abcdef0" })
  })

  it("copy lists every field and open-in-browser needs a known host", () => {
    const copy = find(build(), "ctx-copy")!.children!
    expect(copy.map((c) => c.value)).toEqual(["sha", "shortSha", "message", "author", "date", "all"])
    expect(find(build(), "ctx-open-browser")).toMatchObject({ disabled: true })
    expect(find(build({ webUrl: "https://github.com/o/r/commit/1a2b3c4" }), "ctx-open-browser")?.disabled).toBe(false)
  })

  it("a pending-changes row offers only the commit dialog", () => {
    expect(ids(build({ artificial: true, refs: [] }))).toEqual(["ctx-open-commit"])
  })
})

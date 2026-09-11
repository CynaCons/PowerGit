import { describe, expect, it } from "vitest"
import { buildFileHistoryMenu, type FileHistoryMenuInput } from "./fileHistoryMenuModel"
import { buildRevisionMenu } from "./revisionMenuModel"

// v0.16.0 review, finding 2: "File History exposes the main revision menu,
// including operations absent from GE's FileHistory context menu." The
// grid's menu is FormFileHistory's: copy, the two difftools, manipulate
// commit (revert, cherry-pick), the follow options — and nothing that
// moves a branch.

const base: FileHistoryMenuInput = {
  sha: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
  artificial: false,
  follow: true,
  exact: false,
}

const build = (patch: Partial<FileHistoryMenuInput> = {}) => buildFileHistoryMenu({ ...base, ...patch })

describe("buildFileHistoryMenu", () => {
  it("lists Git Extensions' FormFileHistory items in order, in four groups", () => {
    const nodes = build()
    expect(nodes.map((n) => n.id)).toEqual([
      "ctx-copy",
      "fh-difftool",
      "fh-difftool-local",
      "fh-manipulate",
      "fh-follow",
      "fh-follow-exact",
    ])
    expect(nodes[0].divider).toBeFalsy()
    expect(nodes.filter((n) => n.divider).map((n) => n.id)).toEqual(["fh-difftool", "fh-manipulate", "fh-follow"])
    expect(nodes.find((n) => n.id === "fh-manipulate")?.children?.map((c) => c.id)).toEqual([
      "fh-revert",
      "fh-cherry-pick",
    ])
    expect(nodes.find((n) => n.id === "ctx-copy")?.children?.map((c) => c.value)).toEqual([
      "sha",
      "shortSha",
      "message",
      "author",
      "date",
      "all",
    ])
  })

  it("offers none of the Browse menu's branch operations", () => {
    const ids = new Set(build().flatMap((n) => [n.id, ...(n.children ?? []).map((c) => c.id)]))
    for (const forbidden of [
      "ctx-checkout",
      "ctx-merge",
      "ctx-rebase",
      "ctx-rebase-interactive",
      "ctx-reset",
      "ctx-create-branch",
      "ctx-create-tag",
      "ctx-delete-branch",
      "ctx-delete-tag",
      "ctx-fixup",
      "ctx-squash",
      "ctx-compare",
      "ctx-archive",
      "ctx-open-browser",
    ]) {
      expect(ids.has(forbidden), forbidden).toBe(false)
    }
    // The Browse menu does list them, so the two models are really different.
    const browse = buildRevisionMenu({
      sha: base.sha,
      subject: "x",
      artificial: false,
      refs: [],
      currentBranch: "main",
      localBranches: ["main"],
      tags: [],
      stagedCount: 0,
      otherSelectedSha: null,
      baseSha: null,
      webUrl: null,
      operation: "none",
    }).map((n) => n.id)
    expect(browse).toContain("ctx-reset")
    expect(browse).toContain("ctx-checkout")
  })

  it("mirrors the follow options as check items, exact only while following", () => {
    const on = build({ follow: true, exact: true })
    expect(on.find((n) => n.id === "fh-follow")?.checked).toBe(true)
    expect(on.find((n) => n.id === "fh-follow-exact")?.checked).toBe(true)
    expect(on.find((n) => n.id === "fh-follow-exact")?.disabled).toBeFalsy()
    const off = build({ follow: false, exact: true })
    expect(off.find((n) => n.id === "fh-follow")?.checked).toBe(false)
    expect(off.find((n) => n.id === "fh-follow-exact")?.disabled).toBe(true)
  })

  it("keeps only the difftool and the follow options on a pending-change row", () => {
    const nodes = build({ artificial: true })
    const disabled = nodes.filter((n) => n.disabled).map((n) => n.id)
    expect(disabled).toEqual(["ctx-copy", "fh-difftool-local", "fh-manipulate"])
    expect(nodes.find((n) => n.id === "fh-difftool")?.disabled).toBeFalsy()
    expect(nodes.find((n) => n.id === "fh-follow")?.disabled).toBeFalsy()
  })
})

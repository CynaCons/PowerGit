import { describe, expect, it } from "vitest"
import type { WorkspaceInfo, WorktreeInfo } from "../engine"
import { FOLD_AT, buildCards, fallbackWorkspaces, matchTree, orderTrees, withRecents } from "./workspaceCards"

const tree = (name: string, extra: Partial<WorktreeInfo> = {}): WorktreeInfo => ({
  root: `C:/p/${name}`,
  name,
  branch: `b/${name}`,
  main: false,
  detached: false,
  lastOpened: null,
  pinned: false,
  id: null,
  ...extra,
})

const atlas: WorkspaceInfo = {
  name: "atlas",
  mainRoot: "C:/p/atlas",
  lastOpened: "2026-10-12T10:00:00Z",
  pinned: false,
  worktrees: [
    tree("atlas-old", { lastOpened: "2026-10-01T10:00:00Z" }),
    tree("atlas-new", { lastOpened: "2026-10-12T10:00:00Z" }),
    tree("atlas", { main: true, branch: "main", lastOpened: "2026-10-05T10:00:00Z" }),
    tree("atlas-never"),
    tree("atlas-r6-boot", { branch: "alex/r6_boot", lastOpened: "2026-10-03T10:00:00Z" }),
  ],
}
const model: WorkspaceInfo = {
  name: "model",
  mainRoot: "C:/x/model",
  lastOpened: "2026-09-01T10:00:00Z",
  pinned: false,
  worktrees: [tree("model", { root: "C:/x/model", main: true, branch: "main", lastOpened: "2026-09-01T10:00:00Z" })],
}

describe("orderTrees", () => {
  it("puts the main worktree first, then the most recently opened, never-opened last by name", () => {
    expect(orderTrees(atlas.worktrees).map((t) => t.name)).toEqual([
      "atlas",
      "atlas-new",
      "atlas-r6-boot",
      "atlas-old",
      "atlas-never",
    ])
  })
})

describe("matchTree", () => {
  it("matches a worktree's name, branch or path, case-insensitively", () => {
    expect(matchTree(atlas, atlas.worktrees[4], "R6")?.name).toEqual({ start: 6, end: 8 })
    expect(matchTree(atlas, atlas.worktrees[4], "r6_")?.branch).toEqual({ start: 5, end: 8 })
    expect(matchTree(atlas, atlas.worktrees[4], "C:/p")?.root).toEqual({ start: 0, end: 4 })
    expect(matchTree(atlas, atlas.worktrees[0], "zzz")).toBeNull()
  })

  it("keeps every worktree of a repository whose name matches", () => {
    expect(matchTree(model, model.worktrees[0], "mod")).not.toBeNull()
  })
})

describe("buildCards", () => {
  it("one card per repository, in the engine's order, rows in reading order for the keyboard", () => {
    const { cards, rows, total } = buildCards([atlas, model], "", "recent", new Set())
    expect(cards.map((c) => c.repo.name)).toEqual(["atlas", "model"])
    expect(rows.map((r) => r.tree.name)).toEqual([
      "atlas",
      "atlas-new",
      "atlas-r6-boot",
      "atlas-old",
      "atlas-never",
      "model",
    ])
    expect(total).toBe(6)
  })

  it("sorts the cards A–Z on request", () => {
    expect(buildCards([model, atlas], "", "az", new Set()).cards.map((c) => c.repo.name)).toEqual(["atlas", "model"])
  })

  it("filters rows and drops cards with nothing left", () => {
    const { cards, rows } = buildCards([atlas, model], "r6", "recent", new Set())
    expect(cards.map((c) => c.repo.name)).toEqual(["atlas"])
    expect(rows.map((r) => r.tree.name)).toEqual(["atlas-r6-boot"])
  })

  it(`folds a card after ${FOLD_AT} rows, unfolds on request and never while filtering`, () => {
    const big: WorkspaceInfo = { ...atlas, worktrees: Array.from({ length: 9 }, (_, i) => tree(`wt-${i}`)) }
    expect(buildCards([big], "", "recent", new Set()).cards[0]).toMatchObject({ hidden: 3 })
    expect(buildCards([big], "", "recent", new Set([big.mainRoot!])).cards[0].hidden).toBe(0)
    expect(buildCards([big], "wt", "recent", new Set()).cards[0].rows).toHaveLength(9)
  })

  it("leaves out a root waiting for its Undo", () => {
    const { rows, total } = buildCards([atlas], "", "recent", new Set(), "C:/p/atlas-old")
    expect(rows.map((r) => r.tree.name)).not.toContain("atlas-old")
    expect(total).toBe(4)
  })
})

describe("withRecents", () => {
  it("takes the pin from the recents list, which changes before the workspaces answer does", () => {
    const [w] = withRecents(
      [atlas],
      [
        {
          name: "atlas-new",
          root: "c:/P/atlas-new",
          branch: "x",
          id: "n",
          pinned: true,
          lastOpened: "2026-10-13T10:00:00Z",
        },
      ],
    )
    const tree = w.worktrees.find((t) => t.name === "atlas-new")!
    expect(tree.pinned).toBe(true)
    expect(tree.lastOpened).toBe("2026-10-13T10:00:00Z")
    expect(w.pinned).toBe(true)
    // An unpin in the list unpins at once, whatever the answer still says.
    const [again] = withRecents(
      [w],
      [{ name: "atlas-new", root: "C:/p/atlas-new", branch: "x", id: "n", pinned: false }],
    )
    expect(again.worktrees.find((t) => t.name === "atlas-new")!.pinned).toBe(false)
    expect(again.pinned).toBe(false)
  })
})

describe("fallbackWorkspaces", () => {
  it("makes each recent repository a card of one main worktree", () => {
    const [w] = fallbackWorkspaces([
      { name: "a", root: "C:/a", branch: "main", id: "1", lastOpened: "x", pinned: true },
    ])
    expect(w).toMatchObject({ name: "a", mainRoot: "C:/a", pinned: true })
    expect(w.worktrees).toEqual([
      expect.objectContaining({ root: "C:/a", main: true, branch: "main", id: "1", pinned: true }),
    ])
  })
})

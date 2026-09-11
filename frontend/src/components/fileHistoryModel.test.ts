import { describe, expect, it } from "vitest"
import type { GraphRow } from "../graph/types"
import {
  DEFAULT_FILE_HISTORY_OPTIONS,
  FILE_HISTORY_OPTIONS_KEY,
  fileHistoryFilter,
  fileHistoryTabs,
  fileHistoryTitle,
  pathAtRow,
  pendingCount,
  readFileHistoryOptions,
  resolveFileHistoryTab,
  writeFileHistoryOptions,
} from "./fileHistoryModel"

// Owner (v0.16.0): "right click a file and show the file history ...
// functionally equivalent to GE." The rules below are Git Extensions'
// FormFileHistory: which tabs a row gets (UpdateSelectedFileViewers), how
// the four load options translate to git (FilterInfo.GetRevisionFilter +
// RevisionGridControl.BuildPathFilter), and the window title (SetTitle).

const row = (id: string, path?: string, artificial?: "worktree" | "index"): GraphRow => ({
  rev: { id, parents: [], message: id, author: "", date: "", refs: [], ...(path ? { path } : {}) },
  lane: 0,
  color: 0,
  hasRefs: false,
  isHead: false,
  segments: [],
  ...(artificial ? { artificial } : {}),
})

class MemoryStorage {
  data = new Map<string, string>()
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
}

describe("fileHistoryFilter", () => {
  it("follows renames by default and sends nothing the engine already assumes", () => {
    expect(fileHistoryFilter("src/a.ts", DEFAULT_FILE_HISTORY_OPTIONS)).toEqual({ path: "src/a.ts" })
  })

  it("maps the four GE toggles, with exact under follow and simplify under full", () => {
    expect(fileHistoryFilter("a.ts", { follow: false, exact: true, full: false, simplify: true })).toEqual({
      path: "a.ts",
      follow: false,
    })
    expect(fileHistoryFilter("a.ts", { follow: true, exact: true, full: true, simplify: true })).toEqual({
      path: "a.ts",
      exact: true,
      full: true,
      simplify: true,
    })
    expect(fileHistoryFilter("a.ts", { follow: true, exact: false, full: true, simplify: false })).toEqual({
      path: "a.ts",
      full: true,
    })
  })

  it("never follows a folder", () => {
    expect(fileHistoryFilter("src/", { ...DEFAULT_FILE_HISTORY_OPTIONS, exact: true })).toEqual({
      path: "src/",
      follow: false,
    })
  })
})

describe("tabs", () => {
  it("offers Commit, Diff and View for a commit, Diff alone for a pending row, no View for a folder", () => {
    expect(fileHistoryTabs(row("c1"), "a.ts")).toEqual(["commit", "diff", "view"])
    expect(fileHistoryTabs(row("WORKTREE", undefined, "worktree"), "a.ts")).toEqual(["diff"])
    expect(fileHistoryTabs(row("INDEX", undefined, "index"), "a.ts")).toEqual(["diff"])
    expect(fileHistoryTabs(row("c1"), "src/")).toEqual(["commit", "diff"])
    expect(fileHistoryTabs(undefined, "a.ts")).toEqual(["commit", "diff", "view"])
  })

  it("keeps the chosen tab when the row offers it, else falls back to the row's first", () => {
    expect(resolveFileHistoryTab("view", ["commit", "diff", "view"])).toBe("view")
    expect(resolveFileHistoryTab("view", ["diff"])).toBe("diff")
    expect(resolveFileHistoryTab("commit", ["diff"])).toBe("diff")
    expect(resolveFileHistoryTab("diff", [])).toBe("diff")
  })
})

describe("path at a row", () => {
  it("uses the followed name, the requested one otherwise, and titles like GE", () => {
    expect(pathAtRow(row("c1", "old/name.ts"), "new/name.ts")).toBe("old/name.ts")
    expect(pathAtRow(row("c1"), "new/name.ts")).toBe("new/name.ts")
    expect(pathAtRow(row("WORKTREE", "x", "worktree"), "new/name.ts")).toBe("new/name.ts")
    expect(pathAtRow(undefined, "new/name.ts")).toBe("new/name.ts")
    expect(fileHistoryTitle("new/name.ts", "old/name.ts")).toBe("new/name.ts (old/name.ts)")
    expect(fileHistoryTitle("new/name.ts", "new/name.ts")).toBe("new/name.ts")
  })

  it("puts the pending rows on top only when the status lists the path", () => {
    const files = [{ path: "src/a.ts" }, { path: "src/b.ts" }, { path: "b.ts" }]
    expect(pendingCount("src/a.ts", files)).toBe(1)
    expect(pendingCount("src/", files)).toBe(2)
    expect(pendingCount("c.ts", files)).toBe(0)
    expect(pendingCount("lib/", files)).toBe(0)
  })
})

describe("options storage", () => {
  it("round-trips and tolerates garbage", () => {
    const storage = new MemoryStorage()
    expect(readFileHistoryOptions(storage)).toEqual(DEFAULT_FILE_HISTORY_OPTIONS)
    const custom = { follow: false, exact: true, full: true, simplify: false }
    writeFileHistoryOptions(storage, custom)
    expect(readFileHistoryOptions(storage)).toEqual(custom)
    storage.setItem(FILE_HISTORY_OPTIONS_KEY, "{not json")
    expect(readFileHistoryOptions(storage)).toEqual(DEFAULT_FILE_HISTORY_OPTIONS)
    storage.setItem(FILE_HISTORY_OPTIONS_KEY, JSON.stringify({ full: true, follow: "yes" }))
    expect(readFileHistoryOptions(storage)).toEqual({ ...DEFAULT_FILE_HISTORY_OPTIONS, full: true })
    expect(readFileHistoryOptions(null)).toEqual(DEFAULT_FILE_HISTORY_OPTIONS)
  })
})

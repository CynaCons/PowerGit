import { describe, expect, it } from "vitest"
import type { RepoStatus } from "../engine"
import { statusEquals } from "./statusEquals"

const status = (): RepoStatus => ({ branch: "main", unstagedCount: 1, stagedCount: 0, unstaged: [{ path: "a.txt", status: "M", staged: false }], staged: [], ahead: 0, behind: 0, upstream: "origin/main", state: "none", operation: null, conflicts: [] })

describe("statusEquals", () => {
  it("keeps status identity for an equal poll result", () => expect(statusEquals(status(), status())).toBe(true))
  it("detects a changed file flag", () => { const next = status(); next.unstaged[0].skipWorktree = true; expect(statusEquals(status(), next)).toBe(false) })
})

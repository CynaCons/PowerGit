import { describe, expect, it } from "vitest"
import { headOfKey, reviewKeyOf } from "./reviewKey"

const HEAD = "a".repeat(40)
describe("review keys", () => {
  it("uses full commit ids and pending HEAD suffixes", () => {
    expect(reviewKeyOf({ commitId: "b".repeat(40), pending: null, headId: HEAD })).toBe("b".repeat(40))
    expect(reviewKeyOf({ commitId: null, pending: "worktree", headId: HEAD })).toBe(`${HEAD}-worktree`)
    expect(reviewKeyOf({ commitId: null, pending: "index", headId: HEAD })).toBe(`${HEAD}-index`)
    expect(reviewKeyOf({ commitId: null, pending: "index", headId: null })).toBeNull()
  })
  it("extracts HEAD only from pending keys", () => {
    expect(headOfKey(`${HEAD}-worktree`)).toBe(HEAD)
    expect(headOfKey(`${"c".repeat(64)}-index`)).toBe("c".repeat(64))
    expect(headOfKey(HEAD)).toBeNull()
  })
})

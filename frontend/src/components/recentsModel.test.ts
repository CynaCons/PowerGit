import { expect, test } from "vitest"
import { paletteOf } from "../graph/authorIdentity"
import {
  findMatch,
  matchRecent,
  pathParts,
  repoInitials,
  repoPalette,
  sharedRoot,
  sliceRange,
} from "./recentsModel"

test("repoInitials: two words give a letter each, camel-case and separators count as words", () => {
  expect(repoInitials("PowerGit")).toBe("PG")
  expect(repoInitials("gitextensions-ref")).toBe("GR")
  expect(repoInitials("my_repo.v2")).toBe("MR")
  expect(repoInitials("Northwind Api")).toBe("NA")
  expect(repoInitials("pg-recent-a-x1y2")).toBe("PR")
})

test("repoInitials: one word gives its first two letters, uppercase; nothing gives ?", () => {
  expect(repoInitials("powerspawn")).toBe("PO")
  expect(repoInitials("api")).toBe("AP")
  expect(repoInitials("a")).toBe("A")
  expect(repoInitials("")).toBe("?")
  expect(repoInitials("---")).toBe("?")
})

test("repoPalette: the author discs' hash over the normalised path", () => {
  expect(repoPalette("C:\\dev\\work\\acme\\api")).toBe(paletteOf("c:/dev/work/acme/api"))
  expect(repoPalette("C:\\dev\\public-repo\\powergit")).toBe(repoPalette("c:/dev/public-repo/PowerGit"))
  // Two repositories called api: the name would collide, the path does not.
  expect(repoPalette("C:\\dev\\work\\acme\\api")).not.toBe(repoPalette("C:\\dev\\work\\northwind\\api"))
})

test("sharedRoot: the common prefix on a separator boundary, empty below two entries", () => {
  expect(sharedRoot([])).toBe("")
  expect(sharedRoot(["C:\\dev\\public-repo\\powergit"])).toBe("")
  expect(sharedRoot(["C:\\dev\\public-repo\\powergit", "C:\\dev\\public-repo\\powerspawn"])).toBe(
    "C:\\dev\\public-repo\\",
  )
  expect(sharedRoot(["C:\\dev\\public-repo\\powergit", "C:\\dev\\oss\\shiki", "C:\\Users\\me\\notes"])).toBe("C:\\")
  expect(sharedRoot(["/home/me/project", "/home/me/notes"])).toBe("/home/me/")
  expect(sharedRoot(["C:\\dev\\a", "D:\\dev\\a"])).toBe("")
})

test("sharedRoot: every root keeps its last segment, and case does not split the prefix", () => {
  expect(sharedRoot(["C:\\dev\\a", "C:\\dev\\a\\sub"])).toBe("C:\\dev\\")
  expect(sharedRoot(["C:\\dev\\a", "C:\\dev\\a"])).toBe("C:\\dev\\")
  expect(sharedRoot(["C:\\Dev\\a", "c:\\dev\\b"])).toBe("C:\\Dev\\")
})

test("pathParts: shared prefix dimmed, last segment in ink, the rest between", () => {
  expect(pathParts("C:\\dev\\public-repo\\powergit", "C:\\dev\\")).toEqual({
    shared: "C:\\dev\\",
    mid: "public-repo\\",
    tail: "powergit",
  })
  expect(pathParts("C:\\dev\\x", "")).toEqual({ shared: "", mid: "C:\\dev\\", tail: "x" })
  // A prefix this root does not carry (mixed separators) dims nothing.
  expect(pathParts("C:/dev/x", "C:\\dev\\")).toEqual({ shared: "", mid: "C:/dev/", tail: "x" })
  expect(pathParts("/home/me/notes", "/home/me/")).toEqual({ shared: "/home/me/", mid: "", tail: "notes" })
})

test("findMatch and sliceRange: case-insensitive first occurrence, cut to a segment", () => {
  expect(findMatch("PowerGit", "git")).toEqual({ start: 5, end: 8 })
  expect(findMatch("PowerGit", "")).toBeNull()
  expect(findMatch("PowerGit", "zip")).toBeNull()
  const range = { start: 3, end: 9 }
  expect(sliceRange(range, 0, 5)).toEqual({ start: 3, end: 5 })
  expect(sliceRange(range, 5, 10)).toEqual({ start: 0, end: 4 })
  expect(sliceRange(range, 9, 4)).toBeNull()
  expect(sliceRange(null, 0, 4)).toBeNull()
})

test("matchRecent: name, path or branch, case-insensitive, with the range for the highlight", () => {
  const repo = { name: "PowerGit", root: "C:\\dev\\public-repo\\powergit", branch: "release/2026-09" }
  expect(matchRecent(repo, "")).toEqual({ name: null, root: null, branch: null })
  expect(matchRecent(repo, "  ")).toEqual({ name: null, root: null, branch: null })
  expect(matchRecent(repo, "PUBLIC")).toEqual({ name: null, root: { start: 7, end: 13 }, branch: null })
  expect(matchRecent(repo, "2026")).toEqual({ name: null, root: null, branch: { start: 8, end: 12 } })
  expect(matchRecent(repo, "git")?.name).toEqual({ start: 5, end: 8 })
  expect(matchRecent(repo, "shiki")).toBeNull()
})

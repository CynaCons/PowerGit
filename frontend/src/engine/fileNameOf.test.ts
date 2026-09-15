import { describe, expect, it } from "vitest"
import { fileNameOf } from "./client"

// v0.18.6 "Save as patch…": the Save dialog opens on git's own file name,
// which travels in the engine's Content-Disposition. ASP.NET writes both
// forms (`filename=` and RFC 5987 `filename*=UTF-8''…`); the starred one
// is the exact name when the subject had a non-ASCII character.

describe("fileNameOf", () => {
  it("reads the plain filename, quoted or bare", () => {
    expect(fileNameOf('attachment; filename="0001-change.patch"', "x")).toBe("0001-change.patch")
    expect(fileNameOf("attachment; filename=repo-worktree.patch", "x")).toBe("repo-worktree.patch")
  })

  it("prefers the RFC 5987 form and decodes it", () => {
    expect(fileNameOf("attachment; filename=\"0001-caf.patch\"; filename*=UTF-8''0001-caf%C3%A9.patch", "x")).toBe(
      "0001-café.patch",
    )
  })

  it("falls back when the header is missing or says nothing", () => {
    expect(fileNameOf(null, "abc1234.patch")).toBe("abc1234.patch")
    expect(fileNameOf("inline", "abc1234.patch")).toBe("abc1234.patch")
  })
})

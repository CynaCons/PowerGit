import { describe, expect, it } from "vitest"
import { filterParams } from "./client"

// The query string behind `GET /revisions`: a path filter (v0.16.0) and a
// ref filter (v0.18.5) share it, and the paging hook keys its requests on
// the string, so equal filters must be equal strings.
describe("filterParams", () => {
  it("is empty without a filter, or with a filter that says nothing", () => {
    expect(filterParams(undefined)).toBe("")
    expect(filterParams({})).toBe("")
    expect(filterParams({ path: "" })).toBe("")
  })

  it("sends a bare ref= for an explicit empty set (HEAD alone)", () => {
    expect(filterParams({ refs: [] })).toBe("&ref=")
  })

  it("encodes a path filter and its flags as before", () => {
    expect(filterParams({ path: "src/a b.txt" })).toBe("&path=src%2Fa%20b.txt")
    expect(filterParams({ path: "doc.txt", follow: false, exact: true, full: true, simplify: true })).toBe(
      "&path=doc.txt&follow=false&exact=true&full=true&simplify=true",
    )
  })

  it("repeats ref= in sorted order so the same set is the same key", () => {
    const a = filterParams({ refs: ["refs/heads/b", "refs/tags/v1", "refs/heads/a"] })
    const b = filterParams({ refs: ["refs/tags/v1", "refs/heads/a", "refs/heads/b"] })
    expect(a).toBe("&ref=refs%2Fheads%2Fa&ref=refs%2Fheads%2Fb&ref=refs%2Ftags%2Fv1")
    expect(b).toBe(a)
  })

  it("combines a path and a ref filter", () => {
    expect(filterParams({ path: "doc.txt", refs: ["refs/heads/a"] })).toBe("&path=doc.txt&ref=refs%2Fheads%2Fa")
  })
})

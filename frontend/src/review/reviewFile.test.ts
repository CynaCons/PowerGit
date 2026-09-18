import { describe, expect, it } from "vitest"
import { emptyDoc, parseDoc, recount } from "./reviewModel"
import { reviewMarkdown, serializeDoc } from "./reviewFile"

describe("review file", () => {
  it("serializes in contract order, without an absent head, and round trips", () => {
    const doc = recount({
      ...emptyDoc("c".repeat(40)),
      changed: 1,
      files: { "a.ts": { lines: { "+1": "ok" }, comments: [] } },
    })
    const text = serializeDoc(doc)
    expect(text).toMatch(
      /^\{\n {2}"version".*\n {2}"commit".*\n {2}"reviewed".*\n {2}"changed".*\n {2}"status".*\n {2}"files"/s,
    )
    expect(text).not.toContain('"head"')
    expect(parseDoc(text)).toEqual(doc)
    expect(text.endsWith("\n")).toBe(true)
  })
  it("writes rejected and commented lines in diff order with context and missing-diff labels", () => {
    const key = "a".repeat(40)
    const doc = recount({
      ...emptyDoc(key),
      changed: 4,
      files: {
        "a.ts": { lines: { "+2": "rejected", "-2": "rejected" }, comments: [{ line: "+2", text: "fix this" }] },
        "b.ts": { lines: { "+9": "rejected" }, comments: [] },
        "ok.ts": { lines: { "+1": "ok" }, comments: [] },
      },
    })
    const md = reviewMarkdown(doc, new Map([["a.ts", "@@ -1,3 +1,3 @@\n one\n-old\n+new\n three"]]))
    expect(md).toContain(`# Review of ${key}`)
    expect(md.indexOf("**-2**")).toBeLessThan(md.indexOf("**+2**"))
    expect(md).toContain("**+2** — rejected and comment\n> fix this")
    expect(md).toContain("```diff\n one\n-old\n+new\n three\n```")
    expect(md).toContain("## b.ts\n\n**+9** — rejected\n\n(diff not loaded)")
    expect(md).toContain("## ok.ts\n\nnothing rejected")
  })
})

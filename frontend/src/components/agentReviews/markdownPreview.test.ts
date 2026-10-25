import { describe, expect, it } from "vitest"
import { isMarkdown, previewOf } from "./markdownPreview"
import { hunksOf } from "./roundModel"

const patch = ["@@ -1,2 +1,3 @@", " # Guide", "-old", "+new", "+more"].join("\n")

describe("markdownPreview", () => {
  it("knows a Markdown file by its name", () => {
    expect(["README.md", "docs/a.MARKDOWN", "x.mdx"].map(isMarkdown)).toEqual([true, true, true])
    expect(["notes.txt", "md", "a.md.bak"].map(isMarkdown)).toEqual([false, false, false])
  })

  it("renders the whole file when it matches the patch, else the new side of the changes", () => {
    const hunks = hunksOf(patch, [])
    expect(previewOf("# Guide\nnew\nmore\ntail\n", hunks, false)).toEqual({
      text: "# Guide\nnew\nmore\ntail",
      whole: true,
    })
    expect(previewOf("something else\n", hunks, false)).toEqual({ text: "# Guide\nnew\nmore", whole: false })
    expect(previewOf(null, hunks, true).whole).toBe(true)
  })
})

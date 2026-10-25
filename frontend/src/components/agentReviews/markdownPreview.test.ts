import { describe, expect, it } from "vitest"
import { blocksOf, isMarkdown, previewOf, type PreviewLine } from "./markdownPreview"
import { hunksOf } from "./roundModel"

const patch = ["@@ -1,2 +1,3 @@", " # Guide", "-old", "+new", "+more"].join("\n")
const numbered = (text: string): PreviewLine[] => text.split("\n").map((t, i) => ({ n: i + 1, text: t }))

describe("markdownPreview", () => {
  it("knows a Markdown file by its name", () => {
    expect(["README.md", "docs/a.MARKDOWN", "x.mdx"].map(isMarkdown)).toEqual([true, true, true])
    expect(["notes.txt", "md", "a.md.bak"].map(isMarkdown)).toEqual([false, false, false])
  })

  it("renders the whole file when it matches the patch, else the new side of the changes", () => {
    const hunks = hunksOf(patch, [])
    const whole = previewOf("# Guide\nnew\nmore\ntail\n", hunks, false)
    expect(whole.whole).toBe(true)
    expect(whole.lines.at(-1)).toEqual({ n: 4, text: "tail" })
    const part = previewOf("something else\n", hunks, false)
    expect(part.whole).toBe(false)
    expect(part.lines).toEqual([
      { n: 1, text: "# Guide" },
      { n: 2, text: "new" },
      { n: 3, text: "more" },
    ])
    expect(previewOf(null, hunks, true).whole).toBe(true)
  })

  it("cuts the file into blocks with their lines, fences and loose lists whole", () => {
    const text = [
      "# Guide",
      "",
      "Intro",
      "text.",
      "",
      "```",
      "a",
      "",
      "b",
      "```",
      "",
      "- one",
      "",
      "- two",
      "  more",
      "",
      "End",
    ]
    expect(blocksOf(numbered(text.join("\n"))).map((b) => [b.start, b.end])).toEqual([
      [1, 1],
      [3, 4],
      [6, 10],
      [12, 15],
      [17, 17],
    ])
    expect(blocksOf(numbered(text.join("\n")))[3].text).toBe("- one\n\n- two\n  more")
  })

  it("keeps the changes apart in a partial preview", () => {
    const lines: PreviewLine[] = [
      { n: 3, text: "a" },
      { n: null, text: "" },
      { n: 40, text: "b" },
    ]
    expect(blocksOf(lines).map((b) => b.start)).toEqual([3, 40])
  })
})

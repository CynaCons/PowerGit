import { describe, expect, it } from "vitest"
import { DEFAULT_DIFF_OPTIONS } from "../../engine/commitCache"
import { roundBlocks, sourceFor, type RoundBlock } from "./roundContext"
import { hunksOf } from "./roundModel"

// A 30-line file with line 10 changed and line 20 removed, as git prints it
// with three lines of context.
const oldFile = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`)
const newFile = oldFile.map((l, i) => (i === 9 ? "line 10 changed" : l)).filter((_, i) => i !== 19)
const PATCH = [
  "diff --git a/t.txt b/t.txt",
  "--- a/t.txt",
  "+++ b/t.txt",
  "@@ -7,7 +7,7 @@",
  " line 7",
  " line 8",
  " line 9",
  "-line 10",
  "+line 10 changed",
  " line 11",
  " line 12",
  " line 13",
  "@@ -17,7 +17,6 @@",
  " line 17",
  " line 18",
  " line 19",
  "-line 20",
  " line 21",
  " line 22",
  " line 23",
].join("\n")
const hunks = hunksOf(PATCH, [])
const source = newFile.join("\n") + "\n"

const nums = (rows: { oldNum: number | null; newNum: number | null }[]) => rows.map((r) => [r.oldNum, r.newNum])
const cards = (blocks: RoundBlock[]) => blocks.filter((b) => b.kind === "hunk")

describe("sourceFor", () => {
  it("takes the file when every new-side line of the patch reads the same", () => {
    expect(sourceFor(source, hunks)).toHaveLength(29)
    expect(sourceFor(source.replace(/\n/g, "\r\n"), hunks)).toHaveLength(29)
  })
  it("drops a file that changed since the round", () => {
    expect(sourceFor(source.replace("line 12", "line twelve"), hunks)).toBeNull()
    expect(sourceFor(null, hunks)).toBeNull()
  })
})

describe("roundBlocks", () => {
  it("three lines keeps the captured cards", () => {
    const blocks = roundBlocks(hunks, sourceFor(source, hunks), DEFAULT_DIFF_OPTIONS)
    expect(blocks.map((b) => b.kind)).toEqual(["hunk", "hunk"])
    const [a, b] = cards(blocks) as Extract<RoundBlock, { kind: "hunk" }>[]
    expect(nums(a.before)).toEqual([
      [7, 7],
      [8, 8],
      [9, 9],
    ])
    expect(nums(a.after)).toEqual([
      [11, 11],
      [12, 12],
      [13, 13],
    ])
    expect(nums(b.after)).toEqual([
      [21, 20],
      [22, 21],
      [23, 22],
    ])
  })

  it("zero lines shows the changes only, with or without the file", () => {
    for (const src of [sourceFor(source, hunks), null]) {
      const [a, b] = cards(roundBlocks(hunks, src, { ...DEFAULT_DIFF_OPTIONS, context: 0 })) as Extract<
        RoundBlock,
        { kind: "hunk" }
      >[]
      expect(a.before).toEqual([])
      expect(a.after).toEqual([])
      expect(a.core.map((r) => r.kind)).toEqual(["remove", "add"])
      expect(b.core.map((r) => r.key)).toEqual(["-20"])
    }
  })

  it("more lines come from the file, split between neighbouring cards, numbered on both sides", () => {
    const [a, b] = cards(
      roundBlocks(hunks, sourceFor(source, hunks), { ...DEFAULT_DIFF_OPTIONS, context: 6 }),
    ) as Extract<RoundBlock, { kind: "hunk" }>[]
    expect(a.before.map((r) => r.newNum)).toEqual([4, 5, 6, 7, 8, 9])
    // Lines 11..19 sit between the cards: six after the first, three before the second.
    expect(a.after.map((r) => r.newNum)).toEqual([11, 12, 13, 14, 15, 16])
    expect(nums(b.before)).toEqual([
      [17, 17],
      [18, 18],
      [19, 19],
    ])
    expect(nums(b.after).slice(0, 2)).toEqual([
      [21, 20],
      [22, 21],
    ])
    expect(b.after.at(-1)?.text).toBe("line 26")
    expect(b.after.every((r) => r.kind === "context" && r.key === `+${r.newNum}`)).toBe(true)
  })

  it("without the file, more lines than captured stays at the captured ones", () => {
    const [a] = cards(roundBlocks(hunks, null, { ...DEFAULT_DIFF_OPTIONS, context: 10 })) as Extract<
      RoundBlock,
      { kind: "hunk" }
    >[]
    expect(a.before.map((r) => r.newNum)).toEqual([7, 8, 9])
  })

  it("full file puts every line on screen once, in order", () => {
    const blocks = roundBlocks(hunks, sourceFor(source, hunks), { ...DEFAULT_DIFF_OPTIONS, full: true })
    // Lines 14 to 16 are too short a stretch for a gap: the second card takes them.
    expect(blocks.map((b) => b.kind)).toEqual(["gap", "hunk", "hunk", "gap"])
    const shown = blocks.flatMap((b) => (b.kind === "gap" ? b.rows : [...b.before, ...b.core, ...b.after]))
    expect(shown.filter((r) => r.newNum !== null).map((r) => r.newNum)).toEqual(
      Array.from({ length: 29 }, (_, i) => i + 1),
    )
    expect(shown.filter((r) => r.oldNum !== null).map((r) => r.oldNum)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    )
  })

  it("a change at the top of the file has no gap before it", () => {
    const top = hunksOf("@@ -1,2 +1,2 @@\n-line 1\n+first\n line 2", [])
    const file = ["first", ...oldFile.slice(1)].join("\n")
    const blocks = roundBlocks(top, sourceFor(file, top), { ...DEFAULT_DIFF_OPTIONS, full: true })
    expect(blocks.map((b) => b.kind)).toEqual(["hunk", "gap"])
  })
})

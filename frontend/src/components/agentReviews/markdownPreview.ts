import type { RoundHunk } from "./roundModel"
import { sourceFor } from "./roundContext"

// v0.22.6, owner: "if there is a markdown file, can you give me a button that
// I can switch from the normal text view to the preview view? Just like it is
// in VS Code." What the preview of a review's Markdown file renders.
// v0.22.7, owner: "when I am reviewing markdowns, give me the ability to drop
// a comment directly in the markdown": the file is cut into blocks, each with
// its lines in the file, so a comment on a block is a comment on its first
// line (`+n`), the same line the Changes view shows it on.

export const isMarkdown = (path: string) => /\.(md|markdown|mdx)$/i.test(path)

/** A line of the previewed file; n: its line in the new file, null for the gap between changes. */
export type PreviewLine = { n: number | null; text: string }
/** A block the preview renders on its own: a paragraph, heading, list, table, fence ... */
export type PreviewBlock = { start: number | null; end: number | null; text: string }

/**
 * The file's new side: the whole file when it is known (read from the head
 * or the disk and matching the patch, or an added file), else the new-side
 * lines of the changes only (whole: false).
 */
export function previewOf(
  sourceText: string | null,
  hunks: RoundHunk[],
  added: boolean,
): { lines: PreviewLine[]; whole: boolean } {
  const file = sourceFor(sourceText, hunks)
  if (file) return { lines: file.map((text, i) => ({ n: i + 1, text })), whole: true }
  const lines: PreviewLine[] = []
  hunks.forEach((h, i) => {
    if (i > 0) lines.push({ n: null, text: "" })
    for (const r of h.rows) if (r.kind !== "remove") lines.push({ n: r.newNum, text: r.text })
  })
  return { lines, whole: added && hunks.length <= 1 }
}

const FENCE = /^ {0,3}(```|~~~)/
const LIST_ITEM = /^ {0,3}([-*+]|\d+[.)])\s/

/**
 * The blocks between blank lines. A fence stays whole; a line indented or a
 * list item after a blank line belongs to the list or block above, so a
 * loose list is one block and an indented line never turns into code.
 */
export function blocksOf(lines: PreviewLine[]): PreviewBlock[] {
  const blocks: PreviewLine[][] = []
  let current: PreviewLine[] = []
  let fence: string | null = null
  let blank = false
  for (const line of lines) {
    const opens = FENCE.exec(line.text)?.[1] ?? null
    if (fence) {
      current.push(line)
      if (opens === fence) fence = null
      continue
    }
    if (line.text.trim() === "") {
      if (line.n === null) {
        if (current.length) blocks.push(current)
        current = []
      } else if (current.length) blank = true
      continue
    }
    if (blank) {
      const previous = current[0]?.text ?? ""
      const joins = /^\s/.test(line.text) || (LIST_ITEM.test(line.text) && LIST_ITEM.test(previous))
      if (joins) current.push({ n: null, text: "" })
      else {
        blocks.push(current)
        current = []
      }
      blank = false
    }
    current.push(line)
    if (opens) fence = opens
  }
  if (current.length) blocks.push(current)
  return blocks.map((b) => {
    const nums = b.flatMap((l) => (l.n === null ? [] : [l.n]))
    return { start: nums[0] ?? null, end: nums.at(-1) ?? null, text: b.map((l) => l.text).join("\n") }
  })
}

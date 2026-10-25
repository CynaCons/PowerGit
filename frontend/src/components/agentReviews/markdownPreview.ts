import type { RoundHunk } from "./roundModel"
import { sourceFor } from "./roundContext"

// v0.22.6, owner: "if there is a markdown file, can you give me a button that
// I can switch from the normal text view to the preview view? Just like it is
// in VS Code." What the preview of a review's Markdown file renders.

export const isMarkdown = (path: string) => /\.(md|markdown|mdx)$/i.test(path)

/**
 * The file's new side: the whole file when it is known (read from the head
 * or the disk and matching the patch, or an added file), else the new-side
 * lines of the changes only (whole: false).
 */
export function previewOf(
  sourceText: string | null,
  hunks: RoundHunk[],
  added: boolean,
): { text: string; whole: boolean } {
  const lines = sourceFor(sourceText, hunks)
  if (lines) return { text: lines.join("\n"), whole: true }
  const parts = hunks.map((h) =>
    h.rows
      .filter((r) => r.kind !== "remove")
      .map((r) => r.text)
      .join("\n"),
  )
  return { text: parts.join("\n\n"), whole: added && hunks.length <= 1 }
}

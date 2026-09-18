import { parseGutterLines } from "../components/diffLines"
import { lineKeyOf, parseDoc, type FileReview, type ReviewDoc } from "./reviewModel"

export function serializeDoc(doc: ReviewDoc): string {
  const files: ReviewDoc["files"] = {}
  for (const [path, file] of Object.entries(doc.files)) files[path] = { lines: file.lines, comments: file.comments }
  const ordered: ReviewDoc = {
    version: doc.version,
    commit: doc.commit,
    ...(doc.head === undefined ? {} : { head: doc.head }),
    reviewed: doc.reviewed,
    changed: doc.changed,
    status: doc.status,
    files,
  }
  return `${JSON.stringify(ordered, null, 2)}\n`
}

function title(doc: ReviewDoc): string {
  if (doc.commit.endsWith("-worktree")) return `# Review of the working tree at ${doc.head ?? doc.commit.slice(0, 40)}`
  if (doc.commit.endsWith("-index")) return `# Review of the index at ${doc.head ?? doc.commit.slice(0, 40)}`
  return `# Review of ${doc.commit}`
}

function marked(file: FileReview): Set<string> {
  return new Set([
    ...Object.entries(file.lines)
      .filter(([, state]) => state === "rejected")
      .map(([key]) => key),
    ...file.comments.map((c) => c.line),
  ])
}

export function reviewMarkdown(doc: ReviewDoc, diffs: ReadonlyMap<string, string>): string {
  const rejected = Object.values(doc.files).reduce(
    (n, f) => n + Object.values(f.lines).filter((s) => s === "rejected").length,
    0,
  )
  const comments = Object.values(doc.files).reduce((n, f) => n + f.comments.length, 0)
  const out = [
    title(doc),
    "",
    `${doc.reviewed} / ${doc.changed} lines reviewed · ${rejected} rejected · ${comments} comments`,
  ]
  for (const [path, file] of Object.entries(doc.files)) {
    out.push("", `## ${path}`, "")
    const wanted = marked(file)
    if (wanted.size === 0) {
      out.push("nothing rejected")
      continue
    }
    const diff = diffs.get(path)
    const rows = diff ? parseGutterLines(diff).filter((row) => row.kind !== "other") : []
    const ordered = rows.map((row, index) => ({ key: lineKeyOf(row), index })).filter((x) => x.key && wanted.has(x.key))
    for (const key of wanted) if (!ordered.some((x) => x.key === key)) ordered.push({ key, index: -1 })
    for (const { key, index } of ordered) {
      const notes = file.comments.filter((c) => c.line === key).map((c) => c.text)
      const rejectedLine = file.lines[key!] === "rejected"
      out.push(
        `**${key}** — ${rejectedLine && notes.length ? "rejected and comment" : rejectedLine ? "rejected" : "comment"}`,
      )
      if (notes.length) out.push(...notes.flatMap((note) => note.split("\n").map((line) => `> ${line}`)))
      if (!diff || index < 0) out.push("", "(diff not loaded)", "")
      else {
        const snippet = rows
          .slice(Math.max(0, index - 2), index + 3)
          .map((r) => r.segments.map((s) => s.text).join(""))
          .join("\n")
        out.push("", "```diff", snippet, "```", "")
      }
    }
  }
  return `${out.join("\n").trimEnd()}\n`
}

export { parseDoc }

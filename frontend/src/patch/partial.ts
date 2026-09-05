// Partial patches (v0.13.14). Owner: "in the commit view, we can select a
// piece of diff and reset it like we can in baseline Git Extensions."
// Git Extensions' PatchManager builds a unified diff that contains only the
// selected changed lines and hands it to `git apply`; this is the same idea
// on the engine's DiffDto text, whose rows map 1:1 to `text.split("\n")`
// (DiffView renders them by that index, so a row selection is a set of
// indices into the same array).
//
// Two bases, because the patch must describe the file git will touch:
//   "old"  (stage / unstage with --cached, or any forward apply): the target
//          equals the diff's OLD side. Unselected "+" lines are dropped and
//          unselected "-" lines become context.
//   "new"  (reset selected lines in the working tree: --reverse against the
//          file as it is now): the target equals the diff's NEW side.
//          Unselected "+" lines become context, unselected "-" are dropped.
// Hunk counts are recomputed and starts shifted by the lines already
// emitted, so git needs no fuzz.

export type PatchBase = "old" | "new"

export type Eligibility = { ok: true } | { ok: false; reason: string }

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

export function isChangeLine(line: string): boolean {
  return (line.startsWith("+") && !line.startsWith("+++")) || (line.startsWith("-") && !line.startsWith("---"))
}

/** Whether line-level staging/reset makes sense for this diff text. */
export function partialEligibility(text: string): Eligibility {
  const head = text.split("\n").slice(0, 8)
  if (head.some((l) => l.startsWith("Binary files") || l === "Binary file (not shown)")) {
    return { ok: false, reason: "binary file" }
  }
  if (head.some((l) => l.startsWith("new file mode"))) return { ok: false, reason: "new file: stage or reset it whole" }
  if (head.some((l) => l.startsWith("deleted file mode")))
    return { ok: false, reason: "deleted file: stage or reset it whole" }
  if (!text.includes("\n@@ ")) return { ok: false, reason: "no hunks" }
  return { ok: true }
}

/** Indices of rows that can be part of a line selection (inside a hunk, not the hunk header). */
export function selectableIndices(text: string): Set<number> {
  const out = new Set<number>()
  let inHunk = false
  text.split("\n").forEach((line, i) => {
    if (line.startsWith("@@")) {
      inHunk = true
      return
    }
    if (line.startsWith("diff --git")) inHunk = false
    if (inHunk && line.length > 0) out.add(i)
  })
  return out
}

/**
 * The unified diff restricted to the selected change lines, or null when the
 * selection contains no "+"/"-" line. Context lines in the selection are
 * ignored (they are always kept anyway).
 */
export function buildPartialPatch(text: string, selected: Set<number>, base: PatchBase): string | null {
  const lines = text.split("\n")
  const firstHunk = lines.findIndex((l) => l.startsWith("@@"))
  if (firstHunk < 0) return null
  const header = lines.slice(0, firstHunk).filter((l) => l.length > 0)
  const out: string[] = [...header]
  let delta = 0
  let emitted = 0
  let i = firstHunk
  while (i < lines.length) {
    const m = HUNK.exec(lines[i])
    if (!m) {
      i++
      continue
    }
    const oldStart = Number(m[1])
    const newStart = Number(m[3])
    const heading = m[5] ?? ""
    const body: string[] = []
    let j = i + 1
    while (j < lines.length && !lines[j].startsWith("@@") && !lines[j].startsWith("diff --git")) {
      body.push(lines[j])
      j++
    }
    const kept: string[] = []
    let touched = false
    let lastKept = false
    for (let k = 0; k < body.length; k++) {
      const raw = body[k]
      const idx = i + 1 + k
      if (raw.length === 0) continue
      if (raw.startsWith("\\")) {
        if (lastKept) kept.push(raw)
        continue
      }
      const tag = raw[0]
      const rest = raw.slice(1)
      const isSelected = selected.has(idx)
      if (tag === "+" || tag === "-") {
        if (isSelected) {
          kept.push(raw)
          touched = true
          lastKept = true
        } else if (base === "old") {
          // unselected: "-" still exists in the target (old side) → context; "+" does not exist → drop
          if (tag === "-") {
            kept.push(" " + rest)
            lastKept = true
          } else lastKept = false
        } else {
          // base "new": "+" exists in the target (new side) → context; "-" does not → drop
          if (tag === "+") {
            kept.push(" " + rest)
            lastKept = true
          } else lastKept = false
        }
      } else {
        kept.push(raw)
        lastKept = true
      }
    }
    if (touched) {
      let oldCount = 0
      let newCount = 0
      for (const l of kept) {
        if (l.startsWith("\\")) continue
        if (l.startsWith("+")) newCount++
        else if (l.startsWith("-")) oldCount++
        else {
          oldCount++
          newCount++
        }
      }
      const os = base === "old" ? oldStart : newStart - delta
      const ns = base === "old" ? oldStart + delta : newStart
      out.push(`@@ -${os},${oldCount} +${ns},${newCount} @@${heading}`)
      out.push(...kept)
      delta += newCount - oldCount
      emitted++
    }
    i = j
  }
  if (emitted === 0) return null
  return out.join("\n") + "\n"
}

// Review mode's document model (v0.17.0): pure functions, no React, no
// engine. See docs/design/review-mode.md §1 and the approved prototype
// docs/prototypes/review-mode.html. The VIEW and INTEGRATION workers code
// against these names; they are the v0.17 contract.
//
// A review is one document per reviewed thing (a commit sha, or
// `<HEAD>-worktree` / `<HEAD>-index` for the pending rows). Every changed
// line of every file starts unreviewed; the reviewer marks it `ok` or
// `rejected`. Context lines have no key and are never counted, because a
// reviewer is accountable for what changed, not for what stayed.

export type LineState = "ok" | "rejected"

/** `+<newLine>` for an added line, `-<oldLine>` for a removed one. */
export type LineKey = string

export type FileReview = { lines: Record<LineKey, LineState>; comments: { line: LineKey; text: string }[] }

export type ReviewDoc = {
  version: 1
  /** The review key: a commit sha, or `<HEAD sha>-worktree` / `-index`. */
  commit: string
  head?: string
  /** Derived: marks in the document (`recount`). */
  reviewed: number
  /** The denominator. Not derivable from the marks: the caller that knows
   *  the diff supplies it (`{ ...doc, changed }` then `recount`); 0 means
   *  "not known yet" and keeps the status in progress. */
  changed: number
  status: "in-progress" | "complete"
  files: Record<string, FileReview>
}

const LINE_KEY = /^[+-]\d+$/

/** The key of a parsed diff row; null for context, hunk and meta rows. */
export function lineKeyOf(row: {
  kind: "add" | "remove" | "context" | "other"
  oldNum: number | null
  newNum: number | null
}): LineKey | null {
  if (row.kind === "add" && row.newNum !== null) return `+${row.newNum}`
  if (row.kind === "remove" && row.oldNum !== null) return `-${row.oldNum}`
  return null
}

/** Space, or a click on the mark: unreviewed → ok → rejected → unreviewed. */
export function cycle(state: LineState | undefined): LineState | undefined {
  if (state === undefined) return "ok"
  if (state === "ok") return "rejected"
  return undefined
}

/** `x`: rejected ↔ unreviewed; an ok line goes straight to rejected. */
export function toggleReject(state: LineState | undefined): LineState | undefined {
  return state === "rejected" ? undefined : "rejected"
}

/**
 * Progress of one file over the keys of its changed lines (the caller maps
 * `lineKeyOf` over the parsed rows and drops the nulls). A mark whose key is
 * not among `keys` — a stale mark from a diff that has since moved — is not
 * counted; rejected counts as reviewed and is listed separately.
 */
export function fileProgress(
  file: FileReview | undefined,
  keys: LineKey[],
): { reviewed: number; changed: number; rejected: number } {
  let reviewed = 0
  let rejected = 0
  if (file) {
    for (const key of keys) {
      const state = file.lines[key]
      if (state === undefined) continue
      reviewed += 1
      if (state === "rejected") rejected += 1
    }
  }
  return { reviewed, changed: keys.length, rejected }
}

/**
 * `n`: the index into `keys` of the next unreviewed line after `fromIndex`,
 * wrapping round the end; the current index is the last candidate, so the
 * cursor stays put when it sits on the only unreviewed line. -1 (no cursor)
 * starts at the top. Null when every line is marked or there are none.
 */
export function nextUnreviewed(keys: LineKey[], file: FileReview | undefined, fromIndex: number): number | null {
  const n = keys.length
  if (n === 0) return null
  const start = Math.min(Math.max(fromIndex, -1), n - 1)
  for (let step = 1; step <= n; step++) {
    const i = (start + step) % n
    if (file?.lines[keys[i]] === undefined) return i
  }
  return null
}

export function emptyDoc(commit: string, head?: string): ReviewDoc {
  const doc: ReviewDoc = { version: 1, commit, reviewed: 0, changed: 0, status: "in-progress", files: {} }
  if (head !== undefined) doc.head = head
  return doc
}

/** Rewrites the derived fields: `reviewed` from the marks, `status` from
 *  `reviewed` against `changed`. `changed` is left as supplied. */
export function recount(doc: ReviewDoc): ReviewDoc {
  let reviewed = 0
  for (const file of Object.values(doc.files)) reviewed += Object.keys(file.lines).length
  const status: ReviewDoc["status"] = doc.changed > 0 && reviewed >= doc.changed ? "complete" : "in-progress"
  if (reviewed === doc.reviewed && status === doc.status) return doc
  return { ...doc, reviewed, status }
}

/**
 * The document with one line set (`ok` / `rejected`) or cleared
 * (`undefined`). Immutable: the input and everything it holds are left
 * alone, untouched files keep their identity, and a no-op returns the same
 * document. A file with no marks and no comments left is dropped, so the
 * written file lists only files the reviewer touched.
 */
export function withLine(doc: ReviewDoc, path: string, key: LineKey, state: LineState | undefined): ReviewDoc {
  const file = doc.files[path]
  if (file?.lines[key] === state) return doc
  const lines = { ...file?.lines }
  if (state === undefined) delete lines[key]
  else lines[key] = state
  const comments = file?.comments ?? []
  const files = { ...doc.files }
  if (Object.keys(lines).length === 0 && comments.length === 0) delete files[path]
  else files[path] = { lines, comments }
  return recount({ ...doc, files })
}

/**
 * Reads a document back (the file on disk in v0.19.0, or anything else that
 * claims to be one). Tolerant: unknown keys at any level are ignored, a mark
 * or comment that is not one is dropped, the derived fields are recomputed
 * rather than trusted. Null for anything that is not a version-1 document
 * with a commit key — garbage, another version, the wrong shape.
 */
export function parseDoc(text: string): ReviewDoc | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(raw) || raw.version !== 1) return null
  if (typeof raw.commit !== "string" || raw.commit === "") return null
  const doc = emptyDoc(raw.commit, typeof raw.head === "string" ? raw.head : undefined)
  if (typeof raw.changed === "number" && Number.isFinite(raw.changed) && raw.changed > 0) {
    doc.changed = Math.round(raw.changed)
  }
  if (isRecord(raw.files)) {
    for (const [path, entry] of Object.entries(raw.files)) {
      const file = parseFile(entry)
      if (file) doc.files[path] = file
    }
  }
  return recount(doc)
}

function parseFile(entry: unknown): FileReview | null {
  if (!isRecord(entry)) return null
  const lines: Record<LineKey, LineState> = {}
  if (isRecord(entry.lines)) {
    for (const [key, state] of Object.entries(entry.lines)) {
      if (LINE_KEY.test(key) && (state === "ok" || state === "rejected")) lines[key] = state
    }
  }
  const comments: FileReview["comments"] = []
  if (Array.isArray(entry.comments)) {
    for (const c of entry.comments) {
      if (isRecord(c) && typeof c.line === "string" && LINE_KEY.test(c.line) && typeof c.text === "string") {
        comments.push({ line: c.line, text: c.text })
      }
    }
  }
  if (Object.keys(lines).length === 0 && comments.length === 0) return null
  return { lines, comments }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

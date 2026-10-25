// Agent review rounds, the review screen's pure parts (v0.21.3, layout A of
// docs/prototypes/agent-review-v3.html; docs/design/agent-review-rounds.md
// §3 and §7). The engine stamps a change's verdict when a round is sent;
// until then the screen reads it live from the owner's v0.19 line marks with
// the same rule (AgentReviewHunks.Verdict in the engine).

import type {
  AgentReview,
  AgentReviewChange,
  AgentReviewRound,
  AgentReviewSummary,
  AgentReviewThread,
  AgentReviewVerdict,
} from "../../engine"
import { parseGutterLines } from "../diffLines"
import { withLine, type FileReview, type LineState, type ReviewDoc } from "../../review/reviewModel"

export type HunkRow = {
  kind: "add" | "remove" | "context"
  oldNum: number | null
  newNum: number | null
  text: string
  /** The review line key: `+n` / `-n` for a changed line, `+n` (new side) for context. */
  key: string
}

export type RoundHunk = {
  header: string
  oldStart: number
  newStart: number
  rows: HunkRow[]
  /** The changed lines' keys, which the verdict is read from. */
  keys: string[]
  change: AgentReviewChange | null
}

const HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/** A file's patch as hunks, each matched to the round's change by its header numbers. */
export function hunksOf(patch: string | null, changes: AgentReviewChange[]): RoundHunk[] {
  if (!patch) return []
  const hunks: RoundHunk[] = []
  let current: RoundHunk | null = null
  for (const row of parseGutterLines(patch.replace(/\r/g, "").replace(/\n$/, ""))) {
    const text = row.segments.map((s) => s.text).join("")
    if (row.kind === "other") {
      const m = HEADER.exec(text)
      if (!m) continue
      const oldStart = Number(m[1])
      const newStart = Number(m[2])
      current = {
        header: text,
        oldStart,
        newStart,
        rows: [],
        keys: [],
        change: changes.find((c) => c.oldStart === oldStart && c.newStart === newStart) ?? null,
      }
      hunks.push(current)
      continue
    }
    if (!current) continue
    const key = row.kind === "remove" ? `-${row.oldNum}` : `+${row.newNum}`
    current.rows.push({ kind: row.kind, oldNum: row.oldNum, newNum: row.newNum, text: text.slice(1), key })
    if (row.kind !== "context") current.keys.push(key)
  }
  return hunks.filter((h) => h.keys.length > 0)
}

/** The engine's rule: all rejected → reject; some → mixed; all ok → accept; else undecided. */
export function verdictOf(keys: string[], file: FileReview | undefined): AgentReviewVerdict {
  if (keys.length === 0) return "undecided"
  const marks = keys.map((k) => file?.lines[k])
  const rejected = marks.filter((m) => m === "rejected").length
  if (rejected === keys.length) return "reject"
  if (rejected > 0) return "mixed"
  return marks.every((m) => m === "ok") ? "accept" : "undecided"
}

/** Accept / Reject on a change: every changed line set, or cleared when `state` is undefined. */
export function withVerdict(doc: ReviewDoc, path: string, keys: string[], state: LineState | undefined): ReviewDoc {
  return keys.reduce((d, key) => withLine(d, path, key, state), doc)
}

/** A sent round shows what the engine stamped; an open one reads the marks. */
export function liveVerdict(
  round: AgentReviewRound,
  hunk: RoundHunk,
  path: string,
  doc: ReviewDoc | null,
): AgentReviewVerdict {
  if (round.sentAt && hunk.change) return hunk.change.verdict
  return verdictOf(hunk.keys, doc?.files[path])
}

export type RoundCounts = {
  accept: number
  reject: number
  mixed: number
  undecided: number
  comments: number
  total: number
}

export function roundCounts(round: AgentReviewRound, doc: ReviewDoc | null, threads: AgentReviewThread[]): RoundCounts {
  const counts: RoundCounts = { accept: 0, reject: 0, mixed: 0, undecided: 0, comments: 0, total: 0 }
  for (const file of round.files)
    for (const hunk of hunksOf(
      file.patch,
      round.changes.filter((c) => c.path === file.path),
    )) {
      counts[liveVerdict(round, hunk, file.path, doc)] += 1
      counts.total += 1
    }
  // v0.21.14: reviewer agents' comments go with the round too.
  counts.comments =
    roundComments(round, doc, threads).length +
    threads.filter((t) => t.round === round.n && t.author && t.kind === "round").length
  return counts
}

/** The review file's comments that will go with the round (the ones asked at once are already out). */
export function roundComments(round: AgentReviewRound, doc: ReviewDoc | null, threads: AgentReviewThread[]) {
  const out: { path: string; line: string; text: string }[] = []
  for (const [path, file] of Object.entries(doc?.files ?? {}))
    for (const c of file.comments)
      if (
        !threads.some(
          (t) => t.round === round.n && t.kind === "ask" && t.path === path && t.line === c.line && t.body === c.text,
        )
      )
        out.push({ path, line: c.line, text: c.text })
  return out
}

/** The thread a review-file comment became (or was asked as), for its id, kind and replies. */
export function threadFor(
  threads: AgentReviewThread[],
  round: number,
  path: string,
  line: string,
  text: string,
): AgentReviewThread | null {
  return threads.find((t) => t.round === round && t.path === path && t.line === line && t.body === text) ?? null
}

/**
 * Where earlier rounds' conversations sit in the round being viewed (v0.21.13,
 * owner: "if I drop a comment on round one, when the agent comes with round
 * two, I lose the comments"). Each thread's change is followed forward round
 * by round — the same id (carried) or a change that names it as `from`
 * (revised), any number of hops — until the viewed round (`byChange`), or
 * until the round that removed it (`removed`, with the change as it last was).
 * A thread with no change stays with its file (`byFile`).
 */
export type EarlierThreads = {
  byChange: Map<string, AgentReviewThread[]>
  removed: { change: AgentReviewChange; round: number; threads: AgentReviewThread[] }[]
  byFile: Map<string, AgentReviewThread[]>
}

export function placeThreads(rounds: AgentReviewRound[], threads: AgentReviewThread[], viewed: number): EarlierThreads {
  const out: EarlierThreads = { byChange: new Map(), removed: [], byFile: new Map() }
  const push = <K>(map: Map<K, AgentReviewThread[]>, key: K, t: AgentReviewThread) =>
    map.set(key, [...(map.get(key) ?? []), t])
  const ordered = [...rounds].sort((a, b) => a.n - b.n)
  for (const t of threads) {
    if (t.round >= viewed || t.kind === "withdrawn") continue
    if (t.change === null) {
      push(out.byFile, t.path, t)
      continue
    }
    let current = t.change
    let last = ordered.find((r) => r.n === t.round)?.changes.find((c) => c.id === current) ?? null
    let gone: number | null = null
    for (const r of ordered) {
      if (r.n <= t.round || r.n > viewed) continue
      const next = r.changes.find((c) => c.id === current || c.from === current)
      if (next) {
        current = next.id
        last = next
      } else {
        gone = r.n
        break
      }
    }
    if (gone === null) push(out.byChange, current, t)
    else if (last === null) push(out.byFile, t.path, t)
    else {
      const entry = out.removed.find((e) => e.change.id === last!.id)
      if (entry) entry.threads.push(t)
      else out.removed.push({ change: last, round: gone, threads: [t] })
    }
  }
  return out
}

/** The files that hold earlier conversations but are not in the round (they left it). */
export function filesLeft(earlier: EarlierThreads, round: AgentReviewRound): string[] {
  const inRound = new Set(round.files.map((f) => f.path))
  const paths = [...earlier.removed.map((e) => e.change.path), ...earlier.byFile.keys()]
  return [...new Set(paths)].filter((p) => !inRound.has(p)).sort()
}

/** The commented line as it read in the thread's own round, for a conversation that moved on. */
export function quotedLine(
  rounds: AgentReviewRound[],
  t: AgentReviewThread,
): { kind: "add" | "remove" | "context"; text: string } | null {
  const round = rounds.find((r) => r.n === t.round)
  const file = round?.files.find((f) => f.path === t.path)
  if (!round || !file) return null
  for (const hunk of hunksOf(
    file.patch,
    round.changes.filter((c) => c.path === t.path),
  )) {
    const row = hunk.rows.find((r) => r.key === t.line)
    if (row) return { kind: row.kind, text: row.text }
  }
  return null
}

export const latestRound = (session: AgentReview): AgentReviewRound | null =>
  session.rounds && session.rounds.length > 0 ? session.rounds[session.rounds.length - 1] : null

export type Tone = "wait" | "agent" | "ok" | "muted" | "info"

/** The inbox's and the top bar's status chip. */
export function turnLabel(
  s: Pick<AgentReviewSummary, "status" | "mode" | "unread"> & { round?: number; turn?: AgentReviewSummary["turn"] },
): {
  label: string
  tone: Tone
} {
  const round = s.round ?? 1
  if (s.status === "approved") return { label: `approved · round ${round}`, tone: "ok" }
  if (s.status === "cancelled") return { label: "cancelled", tone: "muted" }
  if (s.status === "expired") return { label: "expired", tone: "muted" }
  if (s.status === "changes_requested") return { label: "changes requested", tone: "muted" }
  if (s.mode === "notify") return { label: s.unread ? "unread" : "read", tone: s.unread ? "info" : "muted" }
  if (s.turn === "agent") return { label: `round ${round} sent · agent revising`, tone: "agent" }
  return { label: `round ${round} · your turn`, tone: "wait" }
}

/** "reading this channel · 3 s ago" / "last read 10:44" / "not reading". */
export function presenceLabel(lastRead: string | null | undefined, reading: boolean, now = Date.now()): string {
  if (!lastRead) return "has not read the channel"
  const at = Date.parse(lastRead)
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (reading) return "reading now"
  if (seconds < 60) return `last read ${seconds} s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `last read ${minutes} min ago`
  const d = new Date(at)
  return `last read ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/** "c3 · src/a.cs:45" → c3: a board message that names a comment links to it. */
export function commentRef(text: string): string | null {
  return /^\s*(c\d+)\s*[:·]/.exec(text)?.[1] ?? null
}

/** "10:42", local time. */
export function clock(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/** The review key of a round's line marks: the session id for round 1, `<id>-r<n>` after. */
export const roundKey = (id: string, n: number) => (n <= 1 ? id : `${id}-r${n}`)

export type InboxFilter = "waiting" | "open" | "all"

export const waitingForYou = (s: AgentReviewSummary) =>
  s.status === "pending" && (s.mode === "wait" ? s.turn !== "agent" : s.unread)

export function filterReviews(sessions: AgentReviewSummary[], filter: InboxFilter) {
  if (filter === "all") return sessions
  if (filter === "open") return sessions.filter((s) => s.status === "pending")
  return sessions.filter(waitingForYou)
}

/** The agent read its channel in the last minute. */
export const onBoard = (s: AgentReviewSummary, now = Date.now()) =>
  Boolean(s.lastRead) && now - Date.parse(s.lastRead!) < 60_000

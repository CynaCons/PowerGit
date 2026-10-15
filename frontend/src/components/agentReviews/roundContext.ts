// Context lines and Full file in the review screen (v0.21.8, owner: "in the
// agents review panel, in the diff, we need to reintegrate our options to
// change how many lines of context we see, or if you want to see the full
// file"). A round's patch is captured once (GitHost.AgentReviewRounds
// CapturePatch) and its hunks are the round's changes, so the cards never
// change: the extra lines come from the file's new side (the round's head
// blob, or the working tree), used only while every line the patch shows on
// the new side still reads the same in it. Otherwise, and for a patch the
// agent supplied, the captured context is all there is.

import type { DiffOptions } from "../../engine"
import type { HunkRow, RoundHunk } from "./roundModel"

/** A change card: its rows with the context above and below cut or extended. */
export type RoundBlock =
  | { kind: "hunk"; hunk: RoundHunk; before: HunkRow[]; core: HunkRow[]; after: HunkRow[] }
  /** Full file: the lines between two cards (or before the first, after the last). */
  | { kind: "gap"; rows: HunkRow[] }

/** The file's lines, or null when they do not match what the patch shows on the new side. */
export function sourceFor(text: string | null, hunks: RoundHunk[]): string[] | null {
  if (text === null) return null
  const lines = text.replace(/\r/g, "").split("\n")
  if (lines.at(-1) === "") lines.pop()
  for (const hunk of hunks)
    for (const row of hunk.rows) if (row.newNum !== null && lines[row.newNum - 1] !== row.text) return null
  return lines
}

const context = (newNum: number, oldNum: number, text: string): HunkRow => ({
  kind: "context",
  oldNum,
  newNum,
  text,
  key: `+${newNum}`,
})

/** The rows from the first change to the last; the captured context around them is in `lead` and `trail`. */
function split(hunk: RoundHunk) {
  const first = hunk.rows.findIndex((r) => r.kind !== "context")
  let last = hunk.rows.length - 1
  while (last > first && hunk.rows[last].kind === "context") last--
  const core = hunk.rows.slice(first, last + 1)
  const lead = hunk.rows.slice(0, first)
  const news = core.flatMap((r) => (r.newNum === null ? [] : [r.newNum]))
  const olds = core.flatMap((r) => (r.oldNum === null ? [] : [r.oldNum]))
  // A side with no line in the core (a pure add or delete) sits right after
  // the line before it: the last lead line, or the header's start, which
  // git gives as the line before for an empty side.
  const newFirst = news[0] ?? (lead.at(-1)?.newNum ?? hunk.newStart) + 1
  const oldFirst = olds[0] ?? (lead.at(-1)?.oldNum ?? hunk.oldStart) + 1
  return {
    core,
    lead,
    trail: hunk.rows.slice(last + 1),
    newFirst,
    newLast: news.at(-1) ?? newFirst - 1,
    oldFirst,
    oldLast: olds.at(-1) ?? oldFirst - 1,
  }
}

/** Full file keeps this much context on each card; the rest of the file sits between the cards,
 *  except a stretch this short, which the card takes. */
const FULL_CARD_CONTEXT = 3

/**
 * The cards with `options.context` lines around each change; with
 * `options.full`, three lines and the rest of the file as gaps between the
 * cards. Without a source the captured context is cut to the count but
 * never extended, and there are no gaps.
 */
export function roundBlocks(hunks: RoundHunk[], source: string[] | null, options: DiffOptions): RoundBlock[] {
  const parts = hunks.map(split)
  if (hunks.length === 0) return []
  if (!source) {
    const n = options.full ? Infinity : options.context
    return hunks.map((hunk, i) => {
      const { core, lead, trail } = parts[i]
      return { kind: "hunk", hunk, before: n === 0 ? [] : lead.slice(-n), core, after: trail.slice(0, n) }
    })
  }
  const rows = (from: number, to: number, delta: number) => {
    const out: HunkRow[] = []
    for (let n = from; n <= to; n++) out.push(context(n, n + delta, source[n - 1]))
    return out
  }
  const want = options.full ? FULL_CARD_CONTEXT : options.context
  const blocks: RoundBlock[] = []
  let prevEnd = 0
  let prevDelta = 0
  let prevAfter: HunkRow[] | null = null
  for (let i = 0; i < hunks.length; i++) {
    const part = parts[i]
    // The lines between the previous card and this one: the previous card's
    // after first, this card's before from the end, the middle a gap.
    const gap = rows(prevEnd + 1, part.newFirst - 1, part.oldFirst - part.newFirst)
    const afterCount = prevAfter ? Math.min(want, gap.length) : 0
    prevAfter?.push(...gap.slice(0, afterCount))
    const rest = gap.slice(afterCount)
    const beforeCount =
      options.full && rest.length - want <= FULL_CARD_CONTEXT ? rest.length : Math.min(want, rest.length)
    if (options.full && rest.length > beforeCount)
      blocks.push({ kind: "gap", rows: rest.slice(0, rest.length - beforeCount) })
    const after: HunkRow[] = []
    blocks.push({ kind: "hunk", hunk: hunks[i], before: rest.slice(rest.length - beforeCount), core: part.core, after })
    prevAfter = after
    prevEnd = part.newLast
    prevDelta = part.oldLast - part.newLast
  }
  const tail = rows(prevEnd + 1, source.length, prevDelta)
  const afterCount = options.full && tail.length - want <= FULL_CARD_CONTEXT ? tail.length : want
  prevAfter?.push(...tail.slice(0, afterCount))
  if (tail.length > afterCount && options.full) blocks.push({ kind: "gap", rows: tail.slice(afterCount) })
  return blocks
}

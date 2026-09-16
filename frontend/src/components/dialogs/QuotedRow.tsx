import { useEffect, useMemo, useState } from "react"
import { useEngine } from "../../engine"
import { authorIdentity } from "../../graph/authorIdentity"
import { LANE_COLORS } from "../../graph/types"
import { formatDate } from "../../hooks/historyMerge"
import { RefChips } from "../RefChips"
import { findRow, useQuote } from "./quoteContext"

// The dialog quotes the graph (v0.18.11, prototype A): the commit an
// operation acts on, drawn as its grid row is — the node in its lane colour
// (a square when it carries refs, HEAD's ring), the 7-char SHA in mono, the
// ref chips through RefChips, the subject on one line, the author disc, the
// date — on the sunken band under the title. When the commit is in the
// loaded rows everything comes from its row; a tip the grid has not loaded
// (a remote branch far away) gets a primary-blue node and the subject,
// author and date from `GET /commits/{sha}`.

/** What the band shows for a commit; the row when loaded, else the fetched detail. */
type Quoted = {
  subject: string
  author: string
  date: string
  refs: string[]
  color: string | null
  square: boolean
  head: boolean
}

export function QuotedRow({
  sha,
  refs: refsOverride,
  short = false,
}: {
  sha: string
  /** Chips to draw instead of the row's (Checkout: the picked remote first). */
  refs?: string[]
  /** A 26 px row (under a caption line). */
  short?: boolean
}) {
  const engine = useEngine()
  const { rows, tagSet, remoteNames, currentBranch } = useQuote()
  const row = useMemo(() => findRow(rows, sha), [rows, sha])
  const [fetched, setFetched] = useState<{ sha: string; q: Quoted } | null>(null)

  useEffect(() => {
    if (row || !sha) return
    let cancelled = false
    engine
      .commit(sha)
      .then((d) => {
        if (cancelled) return
        setFetched({
          sha,
          q: {
            subject: d.subject,
            author: d.author,
            date: formatDate(d.authorDate),
            refs: d.refs,
            color: null,
            square: d.refs.length > 0,
            head: false,
          },
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [engine, row, sha])

  const q: Quoted | null = row
    ? {
        subject: row.rev.message,
        author: row.rev.author,
        date: row.rev.date,
        refs: row.rev.refs,
        color: LANE_COLORS[row.color % LANE_COLORS.length],
        square: row.hasRefs,
        head: row.isHead,
      }
    : fetched && fetched.sha === sha
      ? fetched.q
      : null
  const refs = refsOverride ?? q?.refs ?? []
  const identity = q?.author ? authorIdentity(q.author) : null

  return (
    <div className={`op-qrow${short ? " short" : ""}`} data-testid="quoted-row" data-sha={sha}>
      <span className="op-node">
        <Node
          color={q?.color ?? null}
          lane={row ? row.color : null}
          square={q?.square ?? refs.length > 0}
          head={q?.head ?? false}
        />
      </span>
      <span className="op-qsha">{sha.slice(0, 7)}</span>
      {refs.length > 0 && (
        <RefChips refs={refs} tagSet={tagSet} remoteNames={remoteNames} current={currentBranch} budget={220} />
      )}
      <span className={`op-subj${q ? "" : " muted"}`} title={q?.subject}>
        {q ? q.subject : "…"}
      </span>
      {identity && (
        <span className="author-disc" data-palette={identity.palette} title={q?.author}>
          {identity.initials}
        </span>
      )}
      {q && <span className="op-when">{q.date.slice(0, 10)}</span>}
    </div>
  )
}

/** The node as graph/draw.ts paints it: the lane colour token with the
 *  literal fallback, a square for a commit with refs, HEAD's 2 px ring. A
 *  commit not in the loaded rows has no lane: primary blue. */
function Node({
  color,
  lane,
  square,
  head,
}: {
  color: string | null
  lane: number | null
  square: boolean
  head: boolean
}) {
  const fill =
    lane !== null
      ? `var(--pg-lane-${(lane % LANE_COLORS.length) + 1}, ${color ?? "#1553c9"})`
      : "var(--pg-primary, #1553c9)"
  const ring = head ? { stroke: "var(--pg-lane-head, #1a1a1a)", strokeWidth: 2 } : {}
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
      {square ? (
        <rect x="2" y="2" width="10" height="10" fill={fill} {...ring} />
      ) : (
        <circle cx="7" cy="7" r="5" fill={fill} {...ring} />
      )}
    </svg>
  )
}

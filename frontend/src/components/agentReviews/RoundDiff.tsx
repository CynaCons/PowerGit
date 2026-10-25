import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useMemo } from "react"
import type {
  AgentReviewChange,
  AgentReviewRound,
  AgentReviewThread,
  AgentReviewVerdict,
  DiffOptions,
} from "../../engine"
import type { Token } from "../../highlight"
import type { LineState, ReviewDoc } from "../../review/reviewModel"
import { cycle } from "../../review/reviewModel"
import { Conversation } from "./Conversation"
import { EarlierCards } from "./EarlierCards"
import { Chip, VerdictButton } from "./reviewChips"
import { LineThreads } from "./LineThreads"
import { hunksOf, liveVerdict, quotedLine, type EarlierThreads, type HunkRow, type RoundHunk } from "./roundModel"
import { Thread, type CommentKind } from "./RoundThread"
import { lineComments, replyProps } from "./threadActions"
import type { CommentEdits } from "./useRoundComments"
import { roundBlocks, sourceFor, type RoundBlock } from "./roundContext"
import { useRowTokens } from "./useRowTokens"

// The middle column of the review (v0.21.3, layout A of
// docs/prototypes/agent-review-v3.html): one file of a round as change cards.
// Each card has a verdict bar (Accept / Reject / Comment); a click on a line
// number opens a comment on that line, a click on the mark cycles the line
// (unreviewed → ok → rejected), the v0.19 review marks underneath.
// v0.21.8: the bottom diff's options (context lines, Full file, Wrap lines)
// and its syntax colours; roundContext.ts says where the extra lines come from.

export type RoundDiffProps = {
  round: AgentReviewRound
  path: string
  doc: ReviewDoc | null
  threads: AgentReviewThread[]
  /** The round is the latest, unsent, and the review open: verdicts and comments can change. */
  editable: boolean
  /** Questions go out at once only with a board (and an open review). */
  canAsk: boolean
  /** The previous round's changes, for the "removed" cards. */
  previous: AgentReviewChange[]
  cursor: string | null
  picked: { path: string; key: string } | null
  onPick: (key: string | null) => void
  onVerdict: (keys: string[], state: LineState | undefined) => void
  onMark: (key: string, state: LineState | undefined) => void
  onComment: (key: string, text: string, kind: CommentKind) => void
  /** v0.21.12: edit, delete or withdraw the owner's comments while the round is open. */
  edits?: CommentEdits
  /** v0.21.13: every round, for earlier conversations' own lines. */
  rounds: AgentReviewRound[]
  /** v0.21.13: where earlier rounds' conversations sit in this round (roundModel.placeThreads). */
  earlier: EarlierThreads
  /** v0.21.13: a reply in a conversation, posted on the board; absent when replies are off. */
  onReply?: (thread: AgentReviewThread, body: string) => void
  /** Why replies are off, when they are. */
  replyOff?: string | null
  onCursor: (changeId: string) => void
  options: DiffOptions
  /** Wrap lines, the review screen's own switch (reviewDiffView.ts). */
  wrap: boolean
  /** The file's new side for extra context; null while unknown or unavailable. */
  sourceText: string | null
  /** The source was asked for and came back (or failed): the note may show. */
  sourceSettled: boolean
}

type LineProps = RoundDiffProps & { tokens: Map<HunkRow, Token[]> | null }

const VERDICT_COLOR: Record<AgentReviewVerdict, string> = {
  accept: "var(--pg-review-accept)",
  reject: "var(--pg-review-rejected)",
  mixed: "var(--pg-review-todo)",
  undecided: "divider",
}
/** The human review's stripe on the code (app.css .diff-row-review-*). */
const STRIPE: Partial<Record<string, string>> = {
  todo: "inset 3px 0 0 var(--pg-review-todo-stripe, #d99a2b)",
  rejected: "inset 3px 0 0 var(--pg-review-rejected)",
}
const VERDICT_BG: Record<AgentReviewVerdict, string> = {
  accept: "var(--pg-review-accept-bg)",
  reject: "var(--pg-review-rejected-bg)",
  mixed: "var(--pg-review-todo-bg)",
  undecided: "action.hover",
}

export function RoundDiff(props: RoundDiffProps) {
  const { round, path } = props
  const file = round.files.find((f) => f.path === path)
  const hunks = hunksOf(
    file?.patch ?? null,
    round.changes.filter((c) => c.path === path),
  )
  const { options, sourceText } = props
  const blocks = useMemo(() => {
    const hunks = hunksOf(
      file?.patch ?? null,
      round.changes.filter((c) => c.path === path),
    )
    return roundBlocks(hunks, sourceFor(sourceText, hunks), options)
  }, [file?.patch, round.changes, path, sourceText, options])
  const rows = useMemo(
    () => blocks.flatMap((b) => (b.kind === "gap" ? b.rows : [...b.before, ...b.core, ...b.after])),
    [blocks],
  )
  const tokens = useRowTokens(rows, path)
  const { wrap } = props
  const digits = String(Math.max(1, ...rows.map((r) => Math.max(r.oldNum ?? 0, r.newNum ?? 0)))).length
  if (!file) return <EarlierCards {...props} gone />
  const fromFile = sourceFor(sourceText, hunks) !== null
  const wantsMore = options.full || options.context > 3
  return (
    <Box
      data-testid="round-diff"
      data-path={path}
      data-source={fromFile ? "file" : "patch"}
      data-wrap={wrap ? "true" : undefined}
      sx={{ display: "flex", flexDirection: "column", gap: 1.25, "--round-num-w": `${digits}ch` }}
    >
      {wantsMore && !fromFile && props.sourceSettled && hunks.length > 0 && (
        <Typography data-testid="round-context-note" sx={{ fontSize: 12, color: "text.secondary" }}>
          Only the lines captured with this round are shown: the file has changed since.
        </Typography>
      )}
      {hunks.length === 0 && (
        <Typography color="text.secondary" sx={{ fontSize: 13 }}>
          No changes in this file.
        </Typography>
      )}
      {blocks.map((block) =>
        block.kind === "gap" ? (
          <GapRows key={`gap${block.rows[0].key}`} rows={block.rows} tokens={tokens} {...props} />
        ) : (
          <HunkCard key={`${block.hunk.oldStart}:${block.hunk.newStart}`} block={block} tokens={tokens} {...props} />
        ),
      )}
      <EarlierCards {...props} />
    </Box>
  )
}

/** A table of diff rows in the app's code face, scrolling sideways unless the lines wrap. */
function RowsTable({ wrap, children }: { wrap: boolean; children: React.ReactNode }) {
  return (
    <Box sx={{ overflowX: wrap ? "visible" : "auto" }}>
      <Box
        component="table"
        sx={{
          borderCollapse: "collapse",
          // Unwrapped, the table is as wide as its longest line (the box
          // scrolls), so no column is squeezed under its width.
          width: wrap ? "100%" : "max-content",
          minWidth: "100%",
          // The app's code face (theme/index.ts MONO_FONT, the UI stack by the
          // owner's choice) with tabular figures, as the diff view.
          "& td": {
            fontFamily: "var(--pg-font-mono, monospace)",
            fontSize: 12,
            lineHeight: "18px",
            fontVariantNumeric: "tabular-nums",
            tabSize: 4,
          },
        }}
      >
        <tbody>{children}</tbody>
      </Box>
    </Box>
  )
}

/** Full file: the lines between two cards, outside any card. */
function GapRows({ rows, ...p }: LineProps & { rows: HunkRow[] }) {
  return (
    <Box data-testid="round-gap" sx={{ border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 1.5 }}>
      <RowsTable wrap={p.wrap}>
        {rows.map((row) => (
          <LineRow key={row.key} row={row} {...p} />
        ))}
      </RowsTable>
    </Box>
  )
}

function HunkCard({ block, ...p }: LineProps & { block: Extract<RoundBlock, { kind: "hunk" }> }) {
  const hunk: RoundHunk = block.hunk
  const verdict = liveVerdict(p.round, hunk, p.path, p.doc)
  const change = hunk.change
  // A change that did not move dims only when it was accepted before and still
  // is (v0.22.8, owner: "they are greyed out on subsequent rounds, but I never
  // really reviewed them").
  const carried = change?.origin === "carried" && change.verdict === "accept" && verdict === "accept" && p.round.n > 1
  const focused = change !== null && p.cursor === change.id
  const set = (target: "accept" | "reject") =>
    p.onVerdict(hunk.keys, verdict === target ? undefined : target === "accept" ? "ok" : "rejected")
  const older = change ? (p.earlier.byChange.get(change.id) ?? []) : []
  return (
    <Box
      data-testid="round-change"
      data-change={change?.id ?? ""}
      data-verdict={verdict}
      data-origin={change?.origin ?? ""}
      data-dimmed={carried ? "true" : undefined}
      onMouseDown={() => change && p.onCursor(change.id)}
      sx={{
        border: 1,
        borderColor: VERDICT_COLOR[verdict],
        borderRadius: 1.5,
        overflow: "hidden",
        bgcolor: "background.paper",
        opacity: carried ? 0.62 : 1,
        outline: focused ? "2px solid var(--pg-grid-sel-border, #2563eb)" : "none",
        outlineOffset: 1,
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 0.75,
          px: 1,
          py: 0.5,
          bgcolor: VERDICT_BG[verdict],
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography
          sx={{
            fontFamily: "var(--pg-font-mono, monospace)",
            fontSize: 12,
            color: "text.secondary",
            flex: "1 1 200px",
            minWidth: 0,
          }}
          noWrap
        >
          {change ? `${change.id}  ` : ""}
          {hunk.header}
        </Typography>
        {change?.origin === "carried" && p.round.n > 1 && change.verdict === "accept" && (
          <Chip tone="accept">accepted in round {p.round.n - 1} · unchanged</Chip>
        )}
        {change?.origin === "carried" && p.round.n > 1 && change.verdict !== "accept" && (
          <Chip tone="muted">unchanged since round {p.round.n - 1}</Chip>
        )}
        {change?.origin === "revised" && <Chip tone="agent">revised in round {p.round.n}</Chip>}
        <VerdictButton
          testid="verdict-accept"
          active={verdict === "accept"}
          tone="accept"
          disabled={!p.editable}
          onClick={() => set("accept")}
        >
          ✓ Accept
        </VerdictButton>
        <VerdictButton
          testid="verdict-reject"
          active={verdict === "reject"}
          tone="reject"
          disabled={!p.editable}
          onClick={() => set("reject")}
        >
          ✗ Reject
        </VerdictButton>
        <Button
          size="small"
          variant="outlined"
          data-testid="verdict-comment"
          disabled={!p.editable}
          onClick={() => p.onPick(hunk.keys[0] ?? null)}
          sx={{ minWidth: 0, py: 0, px: 1, fontSize: 12, textTransform: "none" }}
        >
          Comment
        </Button>
      </Box>
      <RowsTable wrap={p.wrap}>
        {[...block.before, ...block.core, ...block.after].map((row) => (
          <LineRow key={row.key + row.kind} row={row} {...p} />
        ))}
        {older.map((t) => (
          <tr key={t.id}>
            <td colSpan={4}>
              <Thread>
                <Conversation
                  thread={t}
                  text={t.body}
                  kind={t.kind}
                  line={t.line}
                  label={`Round ${t.round}, line ${t.line.slice(1)}`}
                  quote={quotedLine(p.rounds, t)}
                  {...replyProps(p, t)}
                />
              </Thread>
            </td>
          </tr>
        ))}
      </RowsTable>
    </Box>
  )
}

function LineRow({ row, ...p }: LineProps & { row: HunkRow }) {
  const state = row.kind === "context" ? undefined : p.doc?.files[p.path]?.lines[row.key]
  const { comments, loose } = lineComments(p, row.key)
  const picked = p.picked?.path === p.path && p.picked.key === row.key
  const bg =
    row.kind === "add"
      ? "var(--pg-diff-added-bg, rgba(24,145,0,.1))"
      : row.kind === "remove"
        ? "var(--pg-diff-removed-bg, rgba(211,0,11,.08))"
        : "transparent"
  const fg =
    row.kind === "add" ? "var(--pg-diff-added)" : row.kind === "remove" ? "var(--pg-diff-removed)" : "text.primary"
  const tokens = p.tokens?.get(row)
  // v0.21.9, owner: "line by line check marks, approve or discard, just like
  // the normal human review in the diff": the human review's mark (app.css
  // .diff-row-mark) on every changed line; amber until marked, only while
  // the round can still change.
  const markable = p.editable && row.kind !== "context"
  const shown = row.kind === "context" ? undefined : (state ?? (p.editable ? "todo" : undefined))
  const num = {
    color: "var(--pg-diff-gutter)",
    textAlign: "right",
    px: 0.75,
    width: "1%",
    whiteSpace: "nowrap",
    // One width for every card and gap of the file, so the code lines up
    // (a table cell ignores min-width; an inline block in it does not).
    "& > span": { display: "inline-block", minWidth: "var(--round-num-w)" },
    userSelect: "none",
    cursor: p.editable ? "pointer" : "default",
  } as const
  return (
    <>
      <Box
        component="tr"
        data-testid="round-line"
        data-key={row.key}
        data-kind={row.kind}
        data-mark={state ?? ""}
        className={shown ? `diff-row-review-${shown}` : undefined}
        sx={{ boxShadow: picked ? "inset 3px 0 0 var(--pg-grid-sel-border, #2563eb)" : "none" }}
      >
        <Box component="td" sx={num} onClick={() => p.editable && p.onPick(row.key)} title="Comment on this line">
          <span>{row.oldNum ?? ""}</span>
        </Box>
        <Box component="td" sx={num} onClick={() => p.editable && p.onPick(row.key)} title="Comment on this line">
          <span>{row.newNum ?? ""}</span>
        </Box>
        <Box
          component="td"
          data-testid="round-mark"
          onClick={() => markable && p.onMark(row.key, cycle(state))}
          title={markable ? "Accept, reject or clear this line" : undefined}
          sx={{
            width: 20,
            minWidth: 20,
            p: 0,
            verticalAlign: "top",
            cursor: markable ? "pointer" : "default",
            bgcolor: bg,
            "& .diff-row-mark": { height: 18, cursor: "inherit" },
          }}
        >
          <span className="diff-row-mark" />
        </Box>
        <Box
          component="td"
          data-testid="round-text"
          sx={{
            whiteSpace: p.wrap ? "pre-wrap" : "pre",
            overflowWrap: p.wrap ? "anywhere" : "normal",
            bgcolor: bg,
            color: fg,
            pl: "6px",
            pr: 1,
            boxShadow: (shown && STRIPE[shown]) ?? "none",
          }}
        >
          {row.kind === "add" ? "+" : row.kind === "remove" ? "-" : " "}
          {tokens
            ? tokens.map((t, j) => (
                <span key={j} className="diff-token" style={{ color: t.color }}>
                  {t.content}
                </span>
              ))
            : row.text}
        </Box>
      </Box>
      {(comments.length > 0 || loose.length > 0 || picked) && (
        <LineThreads p={p} line={row.key} comments={comments} loose={loose} picked={picked} />
      )}
    </>
  )
}

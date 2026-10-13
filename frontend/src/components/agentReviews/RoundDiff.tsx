import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import type { AgentReviewChange, AgentReviewRound, AgentReviewThread, AgentReviewVerdict } from "../../engine"
import type { LineState, ReviewDoc } from "../../review/reviewModel"
import { cycle } from "../../review/reviewModel"
import { Chip, VerdictButton } from "./reviewChips"
import { earlierThreads, hunksOf, liveVerdict, threadFor, type HunkRow, type RoundHunk } from "./roundModel"
import { Draft, Thread, ThreadItems, type CommentKind } from "./RoundThread"

// The middle column of the review (v0.21.3, layout A of
// docs/prototypes/agent-review-v3.html): one file of a round as change cards.
// Each card has a verdict bar (Accept / Reject / Comment); a click on a line
// number opens a comment on that line, a click on the mark cycles the line
// (unreviewed → ok → rejected), the v0.19 review marks underneath.

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
  onCursor: (changeId: string) => void
}

const VERDICT_COLOR: Record<AgentReviewVerdict, string> = {
  accept: "var(--pg-review-accept)",
  reject: "var(--pg-review-rejected)",
  mixed: "var(--pg-review-todo)",
  undecided: "divider",
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
  const removed = props.previous.filter((c) => c.path === path && round.removed.includes(c.id))
  if (!file) return null
  return (
    <Box data-testid="round-diff" data-path={path} sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
      {hunks.length === 0 && (
        <Typography color="text.secondary" sx={{ fontSize: 13 }}>
          No changes in this file.
        </Typography>
      )}
      {hunks.map((hunk) => (
        <HunkCard key={`${hunk.oldStart}:${hunk.newStart}`} hunk={hunk} {...props} />
      ))}
      {removed.map((c) => (
        <Box
          key={c.id}
          data-testid="round-removed"
          sx={{
            border: 1,
            borderColor: "divider",
            borderRadius: 1.5,
            px: 1,
            py: 0.75,
            opacity: 0.7,
            display: "flex",
            gap: 1,
            alignItems: "center",
          }}
        >
          <Chip tone={c.verdict === "reject" ? "accept" : "muted"}>
            {c.verdict === "reject" ? "removed after your rejection" : "removed"}
          </Chip>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            {c.id} · line {c.newLines > 0 ? c.newStart : c.oldStart}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

function HunkCard({ hunk, ...p }: RoundDiffProps & { hunk: RoundHunk }) {
  const verdict = liveVerdict(p.round, hunk, p.path, p.doc)
  const change = hunk.change
  const carried = change?.origin === "carried" && verdict === change.verdict && p.round.n > 1
  const focused = change !== null && p.cursor === change.id
  const set = (target: "accept" | "reject") =>
    p.onVerdict(hunk.keys, verdict === target ? undefined : target === "accept" ? "ok" : "rejected")
  const older = earlierThreads(p.threads, p.round.n, change)
  return (
    <Box
      data-testid="round-change"
      data-change={change?.id ?? ""}
      data-verdict={verdict}
      data-origin={change?.origin ?? ""}
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
      <Box
        component="table"
        sx={{
          borderCollapse: "collapse",
          width: "100%",
          // The app's code face (theme/index.ts MONO_FONT, the UI stack by the
          // owner's choice) with tabular figures, as the diff view.
          "& td": {
            fontFamily: "var(--pg-font-mono, monospace)",
            fontSize: 12,
            lineHeight: "18px",
            fontVariantNumeric: "tabular-nums",
          },
        }}
      >
        <tbody>
          {hunk.rows.map((row) => (
            <LineRow key={row.key + row.kind} row={row} {...p} />
          ))}
          {older.length > 0 && (
            <tr>
              <td colSpan={4}>
                <Thread title={`From round ${older[0].round}`}>
                  {older.map((t) => (
                    <ThreadItems key={t.id} thread={t} text={t.body} kind={t.kind} line={t.line} />
                  ))}
                </Thread>
              </td>
            </tr>
          )}
        </tbody>
      </Box>
    </Box>
  )
}

function LineRow({ row, ...p }: RoundDiffProps & { row: HunkRow }) {
  const state = row.kind === "context" ? undefined : p.doc?.files[p.path]?.lines[row.key]
  const comments = p.doc?.files[p.path]?.comments.filter((c) => c.line === row.key) ?? []
  const loose = p.threads.filter(
    (t) => t.round === p.round.n && t.path === p.path && t.line === row.key && !comments.some((c) => c.text === t.body),
  )
  const picked = p.picked?.path === p.path && p.picked.key === row.key
  const bg =
    row.kind === "add"
      ? "var(--pg-diff-added-bg, rgba(24,145,0,.1))"
      : row.kind === "remove"
        ? "var(--pg-diff-removed-bg, rgba(211,0,11,.08))"
        : "transparent"
  const fg =
    row.kind === "add" ? "var(--pg-diff-added)" : row.kind === "remove" ? "var(--pg-diff-removed)" : "text.primary"
  const num = {
    color: "var(--pg-diff-gutter)",
    textAlign: "right",
    px: 0.75,
    width: "1%",
    whiteSpace: "nowrap",
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
        sx={{ boxShadow: picked ? "inset 3px 0 0 var(--pg-grid-sel-border, #2563eb)" : "none" }}
      >
        <Box component="td" sx={num} onClick={() => p.editable && p.onPick(row.key)} title="Comment on this line">
          {row.oldNum ?? ""}
        </Box>
        <Box component="td" sx={num} onClick={() => p.editable && p.onPick(row.key)} title="Comment on this line">
          {row.newNum ?? ""}
        </Box>
        <Box
          component="td"
          data-testid="round-mark"
          onClick={() => p.editable && row.kind !== "context" && p.onMark(row.key, cycle(state))}
          sx={{
            width: 16,
            textAlign: "center",
            cursor: p.editable && row.kind !== "context" ? "pointer" : "default",
            color: state === "rejected" ? "var(--pg-review-rejected)" : "var(--pg-review-accept)",
            bgcolor: bg,
          }}
        >
          {state === "ok" ? "✓" : state === "rejected" ? "✗" : ""}
        </Box>
        <Box component="td" sx={{ whiteSpace: "pre", bgcolor: bg, color: fg, pr: 1 }}>
          {row.kind === "add" ? "+" : row.kind === "remove" ? "-" : " "}
          {row.text}
        </Box>
      </Box>
      {(comments.length > 0 || loose.length > 0 || picked) && (
        <tr>
          <td colSpan={4}>
            <Thread>
              {comments.map((c, i) => {
                const thread = threadFor(p.threads, p.round.n, p.path, row.key, c.text)
                return (
                  <ThreadItems
                    key={`c${i}`}
                    thread={thread}
                    text={c.text}
                    kind={thread?.kind ?? "round"}
                    line={row.key}
                  />
                )
              })}
              {loose.map((t) => (
                <ThreadItems key={t.id} thread={t} text={t.body} kind={t.kind} line={row.key} />
              ))}
              {picked && (
                <Draft
                  canAsk={p.canAsk}
                  line={row.key}
                  onCancel={() => p.onPick(null)}
                  onSave={(text, kind) => p.onComment(row.key, text, kind)}
                />
              )}
            </Thread>
          </td>
        </tr>
      )}
    </>
  )
}

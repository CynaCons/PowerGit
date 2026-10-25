import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import type { AgentReview, AgentReviewRound } from "../../engine"
import { clock, type RoundCounts } from "./roundModel"

// The round box under the board (v0.21.3; v0.21.12 lane design): the one
// filled surface of the column. The round's name and a quiet Cancel review;
// a meter of the round's changes in the verdict colours with the counts
// under it; the note; Send round n (or Approve all when everything is
// accepted) with Approve all beside it. Read-only once the round is sent, on
// an earlier round, or when the review is closed.

export type RoundActions = {
  send: (note: string) => Promise<void>
  approve: (note: string) => Promise<void>
  cancel: () => Promise<void>
  ack: () => Promise<void>
}

const boxSx = {
  borderTop: 1,
  borderColor: "divider",
  px: 1.5,
  pt: 1.25,
  pb: 1.5,
  display: "grid",
  gap: 1,
  bgcolor: "var(--pg-round-box-bg, rgba(127,127,127,.06))",
} as const

const quietSx = {
  textTransform: "none",
  fontSize: 12,
  color: "text.secondary",
  minWidth: 0,
  px: 0.75,
  py: 0,
  "&:hover": { color: "error.main", bgcolor: "action.hover" },
} as const

function Meter({ counts }: { counts: RoundCounts }) {
  const total = Math.max(counts.total, 1)
  const part = (n: number, color: string, label: string) =>
    n > 0 && <Box title={`${n} ${label}`} sx={{ flex: `${n} 0 0`, bgcolor: color, minWidth: 3 }} />
  return (
    <Box
      data-testid="round-meter"
      sx={{ display: "flex", gap: "2px", height: 6, borderRadius: 3, overflow: "hidden", bgcolor: "action.hover" }}
    >
      {part(counts.accept, "var(--pg-review-accept)", "accepted")}
      {part(counts.reject, "var(--pg-review-rejected)", "rejected")}
      {part(counts.mixed, "var(--pg-review-todo)", "mixed")}
      {counts.undecided > 0 && <Box sx={{ flex: `${counts.undecided} 0 0` }} />}
      {counts.total === 0 && <Box sx={{ flex: `${total} 0 0` }} />}
    </Box>
  )
}

function Count({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, whiteSpace: "nowrap" }}>
      {color && <Box component="span" sx={{ width: 7, height: 7, borderRadius: "2px", bgcolor: color }} />}
      <Box component="span" sx={{ fontWeight: 600, color: "text.primary", fontVariantNumeric: "tabular-nums" }}>
        {n}
      </Box>
      <span>{` ${label}`}</span>
    </Box>
  )
}

function Message({ state, children }: { state: string; children: React.ReactNode }) {
  return (
    <Box data-testid="round-box" data-state={state} sx={boxSx}>
      {children}
    </Box>
  )
}

export function RoundBox({
  session,
  round,
  counts,
  actions,
  busy,
}: {
  session: AgentReview
  round: AgentReviewRound
  counts: RoundCounts
  actions: RoundActions
  busy: boolean
}) {
  const [note, setNote] = useState("")
  const latest = (session.rounds ?? []).at(-1)?.n === round.n
  const open = session.status === "pending"
  const sent = round.sentAt !== null
  const text = { fontSize: 12.5, color: "text.secondary" } as const
  if (!open)
    return (
      <Message state="closed">
        <Typography sx={text}>
          <Box
            component="strong"
            sx={{ color: session.status === "approved" ? "var(--pg-review-accept)" : "text.primary" }}
          >
            {session.status === "approved"
              ? "Approved."
              : session.status === "cancelled"
                ? "Cancelled."
                : `Closed (${session.status}).`}
          </Box>{" "}
          The review file keeps the verdicts and the comments.
        </Typography>
      </Message>
    )
  if (!latest)
    return (
      <Message state="earlier">
        <Typography sx={text}>Round {round.n} is an earlier round. Decide on the latest one.</Typography>
      </Message>
    )
  if (sent)
    return (
      <Message state="sent">
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Round {round.n} sent</Typography>
          <Typography sx={{ ...text, fontSize: 11.5 }}>{clock(round.sentAt!)}</Typography>
          <Button size="small" disabled={busy} onClick={() => void actions.cancel()} sx={{ ...quietSx, ml: "auto" }}>
            Cancel review
          </Button>
        </Box>
        <Typography sx={text}>
          Round {round.n + 1} shows here when {session.agent ?? "the agent"} calls agent_review_revise.
        </Typography>
      </Message>
    )
  const allAccepted = counts.accept === counts.total && counts.total > 0
  return (
    <Message state="open">
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Round {round.n}</Typography>
        <Typography sx={{ ...text, fontSize: 11.5 }}>
          {counts.total - counts.undecided} of {counts.total} decided
        </Typography>
        <Button
          size="small"
          data-testid="round-cancel"
          disabled={busy}
          onClick={() => void actions.cancel()}
          sx={{ ...quietSx, ml: "auto" }}
        >
          Cancel review
        </Button>
      </Box>
      <Meter counts={counts} />
      <Box
        sx={{ display: "flex", flexWrap: "wrap", columnGap: 1.25, rowGap: 0.25, fontSize: 12, color: "text.secondary" }}
      >
        <Count n={counts.accept} label="accepted" color="var(--pg-review-accept)" />
        <Count n={counts.reject} label="rejected" color="var(--pg-review-rejected)" />
        {counts.mixed > 0 && <Count n={counts.mixed} label="mixed" color="var(--pg-review-todo)" />}
        {counts.undecided > 0 && (
          <Count n={counts.undecided} label="undecided" color="var(--pg-review-todo-stripe, #d99a2b)" />
        )}
        <Count n={counts.comments} label={counts.comments === 1 ? "comment" : "comments"} />
      </Box>
      <Box
        component="textarea"
        data-testid="round-note"
        value={note}
        rows={2}
        placeholder={`Note to ${session.agent ?? "the agent"} with the round (optional)`}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
        sx={{
          width: "100%",
          fontFamily: "inherit",
          fontSize: 13,
          lineHeight: 1.45,
          color: "text.primary",
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          borderRadius: 1.5,
          px: 1,
          py: 0.75,
          resize: "vertical",
          outline: 0,
          "&:focus": { borderColor: "primary.main", boxShadow: "0 0 0 3px var(--pg-review-ok-bg)" },
        }}
      />
      <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", flexWrap: "wrap" }}>
        <Button
          variant="contained"
          data-testid="round-send"
          disabled={busy}
          disableElevation
          onClick={() => void (allAccepted ? actions.approve(note) : actions.send(note)).then(() => setNote(""))}
          sx={{
            flex: "1 1 140px",
            textTransform: "none",
            fontWeight: 600,
            fontSize: 13,
            py: 0.6,
            ...(allAccepted && {
              bgcolor: "var(--pg-review-accept)",
              "&:hover": { bgcolor: "var(--pg-review-accept)", filter: "brightness(0.92)" },
            }),
          }}
        >
          {allAccepted
            ? `Approve all (${counts.total})`
            : session.mode === "notify"
              ? "Post the review"
              : `Send round ${round.n}`}
        </Button>
        {!allAccepted && (
          <Button
            variant="outlined"
            data-testid="round-approve"
            disabled={busy}
            onClick={() => void actions.approve(note)}
            sx={{ textTransform: "none", fontSize: 13, py: 0.5 }}
          >
            Approve all
          </Button>
        )}
        {session.mode === "notify" && session.unread && (
          <Button
            size="small"
            data-testid="round-ack"
            disabled={busy}
            onClick={() => void actions.ack()}
            sx={{ textTransform: "none" }}
          >
            Mark read
          </Button>
        )}
      </Box>
    </Message>
  )
}

import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import type { AgentReview, AgentReviewRound } from "../../engine"
import { Chip } from "./reviewChips"
import { clock, type RoundCounts } from "./roundModel"

// The round box under the board (v0.21.3): the round's counts, a note, and
// Send round n / Approve all / Cancel review; read-only once the round is
// sent, on an earlier round, or when the review is closed.

export type RoundActions = {
  send: (note: string) => Promise<void>
  approve: (note: string) => Promise<void>
  cancel: () => Promise<void>
  ack: () => Promise<void>
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
  const box = {
    borderTop: 1,
    borderColor: "divider",
    px: 1.25,
    py: 1,
    display: "grid",
    gap: 0.75,
    bgcolor: "action.hover",
  } as const
  if (!open)
    return (
      <Box data-testid="round-box" data-state="closed" sx={box}>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          {session.status === "approved"
            ? "Approved."
            : session.status === "cancelled"
              ? "Cancelled."
              : `Closed (${session.status}).`}{" "}
          The review file keeps the verdicts and the comments.
        </Typography>
      </Box>
    )
  if (!latest)
    return (
      <Box data-testid="round-box" data-state="earlier" sx={box}>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          Round {round.n} is an earlier round. Decide on the latest one.
        </Typography>
      </Box>
    )
  if (sent)
    return (
      <Box data-testid="round-box" data-state="sent" sx={box}>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          Round {round.n} sent at {clock(round.sentAt!)}. Round {round.n + 1} shows here when{" "}
          {session.agent ?? "the agent"} calls agent_review_revise.
        </Typography>
        <Box>
          <Button size="small" disabled={busy} onClick={() => void actions.cancel()} sx={{ textTransform: "none" }}>
            Cancel review
          </Button>
        </Box>
      </Box>
    )
  const allAccepted = counts.accept === counts.total && counts.total > 0
  return (
    <Box data-testid="round-box" data-state="open" sx={box}>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
        <Chip tone="accept">{counts.accept} accepted</Chip>
        <Chip tone="reject">{counts.reject} rejected</Chip>
        {counts.mixed > 0 && <Chip tone="wait">{counts.mixed} mixed</Chip>}
        <Chip tone="info">
          {counts.comments} comment{counts.comments === 1 ? "" : "s"} for the round
        </Chip>
        {counts.undecided > 0 && <Chip tone="wait">{counts.undecided} undecided</Chip>}
      </Box>
      <Box
        component="textarea"
        data-testid="round-note"
        value={note}
        placeholder="Note with the round (optional)"
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
        sx={{
          width: "100%",
          minHeight: 40,
          fontFamily: "inherit",
          fontSize: 13,
          color: "text.primary",
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          p: 0.75,
          resize: "vertical",
        }}
      />
      <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", flexWrap: "wrap" }}>
        <Button
          variant="contained"
          size="small"
          data-testid="round-send"
          disabled={busy}
          onClick={() => void (allAccepted ? actions.approve(note) : actions.send(note)).then(() => setNote(""))}
          sx={{ flex: 1, textTransform: "none" }}
        >
          {allAccepted
            ? `Approve all (${counts.total})`
            : session.mode === "notify"
              ? "Post the review"
              : `Send round ${round.n}`}
        </Button>
        {!allAccepted && (
          <Button
            size="small"
            data-testid="round-approve"
            disabled={busy}
            onClick={() => void actions.approve(note)}
            sx={{ textTransform: "none" }}
          >
            Approve all
          </Button>
        )}
        <Button
          size="small"
          data-testid="round-cancel"
          disabled={busy}
          onClick={() => void actions.cancel()}
          sx={{ textTransform: "none" }}
        >
          Cancel review
        </Button>
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
    </Box>
  )
}

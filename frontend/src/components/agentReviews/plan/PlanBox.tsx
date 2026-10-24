import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import type { AgentReview, AgentReviewRound } from "../../../engine"
import { fieldSx } from "../fieldSx"
import { planCounts } from "./planModel"

// The plan's box under the board (v0.22.0), in place of a review's round box:
// what the checks found as a meter, a note, Send back and Approve plan. Once
// approved it counts the steps the refs show have run.

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

function Meter({ parts }: { parts: [number, string, string][] }) {
  return (
    <Box sx={{ display: "flex", gap: "2px", height: 6, borderRadius: 3, overflow: "hidden", bgcolor: "action.hover" }}>
      {parts.map(([n, color, label]) =>
        n > 0 ? (
          <Box key={label} title={`${n} ${label}`} sx={{ flex: `${n} 0 0`, bgcolor: color, minWidth: 3 }} />
        ) : null,
      )}
    </Box>
  )
}

export function PlanBox({
  session,
  round,
  busy,
  onSend,
  onApprove,
  onCancel,
}: {
  session: AgentReview
  round: AgentReviewRound
  busy: boolean
  onSend: (note: string) => void
  onApprove: (note: string) => void
  onCancel: () => void
}) {
  const [note, setNote] = useState("")
  const steps = round.plan?.steps ?? []
  const c = planCounts(steps)
  const stale = (round.plan?.moved ?? []).length > 0
  if (session.status === "approved")
    return (
      <Box sx={boxSx}>
        <Typography data-testid="plan-progress" sx={{ fontSize: 12.5 }}>
          Approved. Ran {c.done} of {c.total} steps
          {c.done < c.total ? "; each one ticks as its refs move." : "."}
        </Typography>
        <Meter
          parts={[
            [c.done, "var(--pg-review-accept)", "ran"],
            [c.total - c.done, "var(--pg-graph-nonrelative, #a0a0a0)", "to run"],
          ]}
        />
      </Box>
    )
  if (session.status !== "pending")
    return (
      <Box sx={boxSx}>
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Plan {session.status}.</Typography>
      </Box>
    )
  if (round.sentAt)
    return (
      <Box sx={boxSx}>
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
          Round {round.n} sent back to {session.agent ?? "the agent"}. Waiting for round {round.n + 1}.
        </Typography>
      </Box>
    )
  return (
    <Box sx={boxSx}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 13 }}>Round {round.n}</Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          data-testid="plan-cancel"
          onClick={onCancel}
          disabled={busy}
          sx={{ textTransform: "none", fontSize: 12, color: "text.secondary", minWidth: 0, py: 0 }}
        >
          Cancel plan
        </Button>
      </Box>
      <Meter
        parts={[
          [c.ok, "var(--pg-review-accept)", "checked clean"],
          [c.conflict, "var(--pg-review-rejected)", "conflict risk"],
          [c.unknown, "var(--pg-graph-nonrelative, #a0a0a0)", "checked once the commits exist"],
        ]}
      />
      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
        {c.ok} checked clean · {c.conflict} conflict risk{c.conflict === 1 ? "" : "s"} · {c.unknown} checked once the
        commits exist
      </Typography>
      <Box
        component="textarea"
        data-testid="plan-note"
        value={note}
        placeholder={`Note to ${session.agent ?? "the agent"} with the plan (optional)`}
        aria-label="Note with the plan"
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
        sx={{ ...fieldSx, minHeight: 40 }}
      />
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button
          fullWidth
          variant="outlined"
          data-testid="plan-send"
          disabled={busy}
          onClick={() => onSend(note)}
          sx={{ textTransform: "none" }}
        >
          Send back
        </Button>
        <Button
          fullWidth
          variant="contained"
          data-testid="plan-approve"
          disabled={busy || stale}
          title={stale ? "Check the plan again first: the repository moved" : undefined}
          onClick={() => onApprove(note)}
          sx={{ textTransform: "none" }}
        >
          Approve plan
        </Button>
      </Box>
    </Box>
  )
}

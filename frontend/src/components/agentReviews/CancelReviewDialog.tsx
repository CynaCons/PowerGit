import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import type { AgentReviewEverywhereItem } from "../../engine"

// v0.22.10, owner: "In the overview of all reviews, there should be an option
// to cancel the review, and the agent should be notified." The message goes
// to the agent on the review's channel and in agent_review_wait / get.

export function CancelReviewDialog({
  item,
  onClose,
  onCancel,
}: {
  item: AgentReviewEverywhereItem
  onClose: () => void
  onCancel: (message: string) => Promise<void>
}) {
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const s = item.session
  const plan = s.kind === "plan"
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth data-testid="cancel-review-dialog">
      <DialogTitle sx={{ fontSize: 16 }}>Cancel {plan ? "the plan" : "the review"}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13, mb: 1.5 }}>
          {s.title} ({item.repo.name}). {s.agent ?? "The agent"} is told it was cancelled
          {s.board ? " on the review's channel" : ""} and when it next reads the review.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          size="small"
          label="Message to the agent (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          slotProps={{ htmlInput: { "data-testid": "cancel-message" } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: "none" }}>
          Keep it
        </Button>
        <Button
          color="error"
          variant="contained"
          disabled={busy}
          data-testid="cancel-confirm"
          onClick={() => {
            setBusy(true)
            void onCancel(message).finally(() => setBusy(false))
          }}
          sx={{ textTransform: "none" }}
        >
          Cancel {plan ? "plan" : "review"}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

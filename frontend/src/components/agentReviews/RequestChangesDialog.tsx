import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useState } from "react"

export function RequestChangesDialog({
  open,
  onClose,
  onSend,
}: {
  open: boolean
  onClose: () => void
  onSend: (summary: string) => void
}) {
  const [summary, setSummary] = useState("")
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Request changes</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          slotProps={{ htmlInput: { "data-testid": "agent-review-summary" } }}
          label="Summary"
        />
        <Typography variant="caption" color="text.secondary">
          The line comments of this review go with it.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button data-testid="agent-review-send" variant="contained" onClick={() => onSend(summary)}>
          Send
        </Button>
      </DialogActions>
    </Dialog>
  )
}

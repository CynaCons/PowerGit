import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogContentText from "@mui/material/DialogContentText"
import DialogTitle from "@mui/material/DialogTitle"

/** In-app confirmation (v0.13.14). Replaces window.confirm, which the
 *  WebView renders as a bare OS prompt and which blocks automation. */
export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  destructive = false,
  testid = "confirm-dialog",
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  text: string
  confirmLabel: string
  destructive?: boolean
  testid?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onClose={onCancel} data-testid={testid} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 15 }}>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontSize: 13, whiteSpace: "pre-line" }}>{text}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onCancel} data-testid={`${testid}-cancel`}>
          Cancel
        </Button>
        <Button
          size="small"
          variant="contained"
          color={destructive ? "error" : "primary"}
          onClick={onConfirm}
          autoFocus
          data-testid={`${testid}-confirm`}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

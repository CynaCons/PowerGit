import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import type { PaperProps } from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import type { ReactNode } from "react"

// Shared shell for the small git-operation dialogs: title, stacked content,
// action row.
export function OpDialog({
  open,
  title,
  onClose,
  children,
  actions,
  testid,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  actions: ReactNode
  /** Marks the dialog surface, so a spec can assert what it says (v0.15.0). */
  testid?: string
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      // MUI's paper slot props are typed to PaperProps, which has no index
      // signature for data-* attributes; the DOM takes them all the same.
      slotProps={testid ? { paper: { "data-testid": testid } as PaperProps } : undefined}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>{children}</DialogContent>
      <DialogActions>{actions}</DialogActions>
    </Dialog>
  )
}

export function OpError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <Typography variant="body2" color="error">
      {error}
    </Typography>
  )
}

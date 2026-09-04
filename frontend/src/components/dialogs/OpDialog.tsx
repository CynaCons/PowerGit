import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
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
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  actions: ReactNode
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
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

import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { previewIgnore, type IgnorePreview } from "../engine"

type Props = {
  open: boolean
  initialPattern: string
  onClose: () => void
  onConfirm: (pattern: string) => Promise<void>
}

// Mirrors Git Extensions' "Add to .gitignore" dialog: pattern edit plus a
// live preview of the files that would be ignored, with a match count.
export function IgnoreDialog({ open, initialPattern, onClose, onConfirm }: Props) {
  const [pattern, setPattern] = useState(initialPattern)
  const [preview, setPreview] = useState<IgnorePreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setPattern(initialPattern)
      setError(null)
    }
  }, [open, initialPattern])

  useEffect(() => {
    if (!open || !pattern.trim()) {
      setPreview(null)
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      previewIgnore(pattern)
        .then((p) => {
          if (!cancelled) setPreview(p)
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "preview failed")
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [open, pattern])

  async function confirm() {
    try {
      await onConfirm(pattern.trim())
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed")
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" data-testid="ignore-dialog">
      <DialogTitle>Add to .gitignore</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <TextField
          data-testid="ignore-pattern"
          size="small"
          label="Pattern"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="e.g. *.log or build/"
          autoFocus
        />
        <Typography variant="body2" color="text.secondary">
          {preview ? `${preview.count} existing file(s) will be ignored:` : "Preview loads as you type."}
        </Typography>
        <Box
          data-testid="ignore-preview"
          sx={{
            maxHeight: 220,
            overflow: "auto",
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            p: 0.5,
            fontFamily: "Fira Code, ui-monospace, monospace",
            fontSize: 11.5,
          }}
        >
          {preview && preview.files.length > 0 ? (
            preview.files.map((f) => (
              <Box key={f} sx={{ py: 0.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {f}
              </Box>
            ))
          ) : (
            <Typography variant="caption" color="text.secondary">
              {preview ? "No matching files." : ""}
            </Typography>
          )}
        </Box>
        {error && (
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!pattern.trim()} onClick={confirm} data-testid="ignore-confirm">
          Add
        </Button>
      </DialogActions>
    </Dialog>
  )
}

import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { describeThrown } from "../engine"
import { isTauriShell } from "../shell"

/**
 * One-line prompt of the commit dialog's file menu (v0.16.0): "Open with…"
 * asks for a program, "Rename / move…" for the new name — Git Extensions'
 * OsShellUtil.OpenAs and its SimplePrompt. With `browse`, the Tauri shell
 * offers its native file picker for the program; the browser build types it.
 */
export function CommitFilePromptDialog({
  open,
  testid,
  title,
  label,
  initialValue,
  placeholder,
  confirmLabel,
  browse = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  testid: string
  title: string
  label: string
  initialValue: string
  placeholder?: string
  confirmLabel: string
  browse?: boolean
  onConfirm: (value: string) => Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setValue(initialValue)
      setError(null)
      setBusy(false)
    }
  }, [open, initialValue])

  async function confirm() {
    const v = value.trim()
    if (!v || busy) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm(v)
    } catch (e) {
      setError(describeThrown(e))
      setBusy(false)
    }
  }

  async function pick() {
    try {
      const { open: openPicker } = await import("@tauri-apps/plugin-dialog")
      const picked = await openPicker({ multiple: false, directory: false, title })
      if (typeof picked === "string" && picked) setValue(picked)
    } catch (e) {
      setError(describeThrown(e))
    }
  }

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth data-testid={testid}>
      <DialogTitle sx={{ fontSize: 15 }}>{title}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <TextField
          size="small"
          label={label}
          value={value}
          placeholder={placeholder}
          autoFocus
          fullWidth
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void confirm()
            }
          }}
          slotProps={{ htmlInput: { "data-testid": `${testid}-input` }, inputLabel: { shrink: true } }}
        />
        {browse && isTauriShell() && (
          <Button size="small" sx={{ alignSelf: "flex-start" }} onClick={() => void pick()}>
            Browse…
          </Button>
        )}
        {error && (
          <Typography role="alert" color="error" variant="body2" sx={{ overflowWrap: "anywhere" }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onCancel} data-testid={`${testid}-cancel`}>
          Cancel
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={!value.trim() || busy}
          onClick={() => void confirm()}
          data-testid={`${testid}-confirm`}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

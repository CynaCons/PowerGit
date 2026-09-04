import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { describeThrown, useEngine } from "../engine"

type Props = {
  open: boolean
  name: string
  onClose: () => void
}

// Minimal GE-style "configure remote": edit the fetch/push URL.
export function RemoteDialog({ open, name, onClose }: Props) {
  const engine = useEngine()
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    engine
      .remotes()
      .then((rs) => setUrl(rs.find((r) => r.name === name)?.url ?? ""))
      .catch(() => setUrl(""))
  }, [engine, open, name])

  async function save() {
    try {
      await engine.saveRemote(name, url.trim())
      onClose()
    } catch (e) {
      // `describeThrown` (engine.ts) reads `.message` defensively: a WebKit
      // DOMException (e.g. from a malformed response) does not reliably
      // satisfy `instanceof Error` across engines, so the banner must not
      // assume it does — the operation name is always kept regardless.
      setError(`Save remote failed: ${describeThrown(e)}`)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" data-testid="remote-dialog">
      <DialogTitle>Configure remote &lsquo;{name}&rsquo;</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <TextField
          data-testid="remote-url"
          size="small"
          label="URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
        />
        {error && (
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} data-testid="remote-save">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}

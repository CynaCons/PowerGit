import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import Dialog from "@mui/material/Dialog"
import FormControlLabel from "@mui/material/FormControlLabel"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { applyStash, dropStash, fetchStashes, stashChanges, type StashInfo } from "../engine"

type Props = {
  open: boolean
  dirtyCount: number
  onClose: () => void
  onStatus: (status: import("../engine").RepoStatus) => void
}

// Mirrors Git Extensions FormStash: stash form on the left (message +
// options), stashes list with Apply / Pop / Drop actions.
export function StashDialog({ open, dirtyCount, onClose, onStatus }: Props) {
  const [stashes, setStashes] = useState<StashInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [keepIndex, setKeepIndex] = useState(false)
  const [includeUntracked, setIncludeUntracked] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    try {
      const list = await fetchStashes()
      setStashes(list)
      setSelected((cur) => (cur && list.some((s) => s.reference === cur) ? cur : (list[0]?.reference ?? null)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load stashes")
    }
  }

  useEffect(() => {
    if (open) {
      setError(null)
      setMessage("")
      refresh()
    }
  }, [open])

  async function run(action: () => Promise<unknown>) {
    try {
      setError(null)
      await action()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "operation failed")
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" data-testid="stash-dialog">
      <Box sx={{ px: 3, pt: 2.5 }}>
        <Typography variant="h6">Stash</Typography>
      </Box>
      <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          {dirtyCount > 0
            ? `${dirtyCount} local change(s) can be stashed.`
            : "Working tree is clean — nothing to stash."}
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField
            data-testid="stash-message"
            size="small"
            fullWidth
            label="Stash message (optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button
            data-testid="stash-push"
            variant="contained"
            disabled={dirtyCount === 0}
            onClick={async () => {
              await run(async () => onStatus(await stashChanges(message || null, keepIndex, includeUntracked)))
              setMessage("")
              onClose()
            }}
          >
            Stash
          </Button>
        </Box>
        <Box sx={{ display: "flex", gap: 2 }}>
          <FormControlLabel
            control={<Checkbox size="small" checked={keepIndex} onChange={(e) => setKeepIndex(e.target.checked)} />}
            slotProps={{ typography: { variant: "body2" } }}
            label="Keep staged changes staged"
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={includeUntracked}
                onChange={(e) => setIncludeUntracked(e.target.checked)}
              />
            }
            slotProps={{ typography: { variant: "body2" } }}
            label="Include untracked files"
          />
        </Box>

        <Typography variant="subtitle2" sx={{ mt: 1 }}>
          Stashes ({stashes.length})
        </Typography>
        <Box
          data-testid="stash-list"
          sx={{ maxHeight: 220, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}
        >
          {stashes.length === 0 ? (
            <Box sx={{ p: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                No stashes.
              </Typography>
            </Box>
          ) : (
            stashes.map((s) => (
              <Box
                key={s.reference}
                onClick={() => setSelected(s.reference)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1,
                  py: 0.25,
                  cursor: "default",
                  bgcolor: selected === s.reference ? "action.selected" : "transparent",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: "Fira Code, ui-monospace, monospace",
                    fontSize: 11.5,
                    flexShrink: 0,
                    color: "primary.main",
                  }}
                >
                  {s.reference}
                </Typography>
                <Typography variant="body2" noWrap sx={{ fontSize: 12, flex: 1 }} title={s.subject}>
                  {s.subject}
                </Typography>
                <Button
                  size="small"
                  sx={{ py: 0, fontSize: 11, minWidth: 0 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    run(async () => onStatus(await applyStash(s.reference)))
                  }}
                >
                  Apply
                </Button>
                <Button
                  size="small"
                  sx={{ py: 0, fontSize: 11, minWidth: 0 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    run(async () => onStatus(await applyStash(s.reference, true)))
                  }}
                >
                  Pop
                </Button>
                <Button
                  size="small"
                  color="error"
                  sx={{ py: 0, fontSize: 11, minWidth: 0 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm(`Drop ${s.reference}? This cannot be undone.`)) {
                      run(() => dropStash(s.reference))
                    }
                  }}
                >
                  Drop
                </Button>
              </Box>
            ))
          )}
        </Box>
        {error && (
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        )}
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={onClose}>Close</Button>
        </Box>
      </Box>
    </Dialog>
  )
}

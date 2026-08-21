import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogContent from "@mui/material/DialogContent"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { fetchWorkTreeDiff, stagePaths, type DiffDto, type RepoStatus, type StatusFile } from "../engine"
import { CompactFileList, type CompactFile } from "./CompactFileList"
import { DiffView } from "./DiffView"

type Props = {
  open: boolean
  status: RepoStatus | null
  onClose: () => void
  onStatus: (status: RepoStatus) => void
  onCommit: (message: string) => Promise<void>
}

// Layout mirrors Git Extensions FormCommit: unstaged/staged lists stacked on
// the left, selected-file diff on the right, commit message bottom-right.
export function CommitDialog({ open, status, onClose, onStatus, onCommit }: Props) {
  const [selected, setSelected] = useState<{ path: string; staged: boolean } | null>(null)
  const [diff, setDiff] = useState<DiffDto | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setDiff(null)
    setMessage("")
    setError(null)
  }, [open])

  useEffect(() => {
    if (!selected) {
      setDiff(null)
      return
    }
    let cancelled = false
    fetchWorkTreeDiff(selected.path, selected.staged)
      .then((d) => {
        if (!cancelled) setDiff(d)
      })
      .catch((e: unknown) => {
        if (!cancelled) setDiff({ path: selected.path, text: e instanceof Error ? e.message : "diff failed", binary: false })
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  async function toggle(file: StatusFile) {
    try {
      onStatus(await stagePaths([file.path], file.staged))
      setSelected((cur) => (cur?.path === file.path ? null : cur))
    } catch (e) {
      setError(e instanceof Error ? e.message : "stage failed")
    }
  }

  const canCommit = Boolean(message.trim()) && (status?.stagedCount ?? 0) > 0

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" data-testid="commit-overlay">
      <DialogContent sx={{ display: "flex", gap: 2, minHeight: 480, p: 2 }}>
        <Box sx={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <FileListHeader label={`Unstaged (${status?.unstagedCount ?? 0})`} />
          <FileListBox
            testid="unstaged-list"
            files={status?.unstaged ?? []}
            selectedPath={selected && !selected.staged ? selected.path : null}
            emptyText="Working tree clean."
            onSelect={(f) => setSelected({ path: f.path, staged: false })}
            onToggle={(f) => toggle({ ...f, staged: false })}
          />
          <FileListHeader label={`Staged (${status?.stagedCount ?? 0})`} />
          <FileListBox
            testid="staged-list"
            files={status?.staged ?? []}
            selectedPath={selected?.staged ? selected.path : null}
            emptyText="Nothing staged. Double-click an unstaged file to stage it."
            onSelect={(f) => setSelected({ path: f.path, staged: true })}
            onToggle={(f) => toggle({ ...f, staged: true })}
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <Box
            data-testid="commit-diff"
            sx={{ flex: 1, minHeight: 0, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}
          >
            {diff ? (
              <DiffView text={diff.text} />
            ) : (
              <Typography color="text.secondary">Select a file to see its diff.</Typography>
            )}
          </Box>
          {error && <Typography color="error">{error}</Typography>}
          <TextField
            data-testid="commit-message"
            fullWidth
            multiline
            minRows={3}
            placeholder="Commit message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              data-testid="commit-submit"
              variant="contained"
              disabled={!canCommit}
              onClick={async () => {
                await onCommit(message.trim())
                setMessage("")
              }}
            >
              Commit
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  )
}

function FileListHeader({ label }: { label: string }) {
  return (
    <Typography variant="subtitle2" sx={{ px: 0.5 }}>
      {label}
    </Typography>
  )
}

function FileListBox({
  files,
  selectedPath,
  emptyText,
  onSelect,
  onToggle,
  testid,
}: {
  files: StatusFile[]
  selectedPath: string | null
  emptyText: string
  onSelect: (f: CompactFile) => void
  onToggle: (f: CompactFile) => void
  testid: string
}) {
  return (
    <CompactFileList
      testid={testid}
      files={files}
      selectedPath={selectedPath}
      emptyText={emptyText}
      onSelect={onSelect}
      onToggle={onToggle}
    />
  )
}

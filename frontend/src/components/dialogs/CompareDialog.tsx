import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import Typography from "@mui/material/Typography"
import { useCallback, useEffect, useState } from "react"
import { describeThrown, useEngine, type DiffDto, type FileChange } from "../../engine"
import { CompactFileList } from "../CompactFileList"
import { DiffView } from "../DiffView"
import { EmptyState, ErrorState, LoadingState } from "../AsyncState"

// GE's "Compare with…" entries, as one dialog over /compare: the changed
// files on the left, the selected file's diff on the right. It uses the
// bottom panel's own CompactFileList and DiffView so a diff looks the same
// wherever it is shown.

const label = (sha: string | null, text?: string) => text ?? (sha === null ? "working directory" : sha.slice(0, 7))

export function CompareDialog({
  open,
  from,
  to,
  fromLabel,
  toLabel,
  onClose,
}: {
  open: boolean
  from: string
  /** null compares `from` against the working directory. */
  to: string | null
  fromLabel?: string
  toLabel?: string
  onClose: () => void
}) {
  const engine = useEngine()
  const [files, setFiles] = useState<FileChange[] | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [diff, setDiff] = useState<DiffDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const changes = await engine.compare(from, to)
      setFiles(changes.files)
      setDiff(changes.firstDiff)
      setPath(changes.firstDiff?.path ?? changes.files[0]?.path ?? null)
    } catch (e) {
      setError(describeThrown(e))
      setFiles([])
    } finally {
      setBusy(false)
    }
  }, [engine, from, to])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  const select = async (nextPath: string) => {
    setPath(nextPath)
    setBusy(true)
    try {
      setDiff(await engine.compareDiff(from, to, nextPath))
    } catch (e) {
      setError(describeThrown(e))
      setDiff(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth data-testid="compare-dialog">
      <DialogTitle sx={{ fontSize: 15 }}>{`Compare ${label(from, fromLabel)} with ${label(to, toLabel)}`}</DialogTitle>
      <DialogContent sx={{ display: "flex", gap: 1, height: 460, pb: 1 }}>
        <Box sx={{ width: 300, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <Typography variant="caption" color="text.secondary" data-testid="compare-count">
            {files ? `${files.length} file${files.length === 1 ? "" : "s"} changed` : "Loading…"}
          </Typography>
          <CompactFileList
            testid="compare-files"
            files={files ?? []}
            selectedPath={path}
            emptyText="No differences."
            onSelect={(f) => void select(f.path)}
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", bgcolor: "background.paper" }}>
          {error ? (
            <ErrorState message={error} onRetry={() => void load()} testid="compare-error" />
          ) : diff ? (
            <DiffView diff={diff} />
          ) : busy ? (
            <LoadingState label="Loading diff…" testid="compare-loading" />
          ) : (
            <EmptyState text="Select a file." testid="compare-empty" />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose} data-testid="compare-close">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

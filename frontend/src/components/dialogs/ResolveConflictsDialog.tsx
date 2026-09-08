import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import Typography from "@mui/material/Typography"
import { useEffect, useMemo, useState } from "react"
import {
  describeThrown,
  useEngine,
  type ConflictFile,
  type ConflictStage,
  type DiffDto,
  type RepoStatus,
} from "../../engine"
import { MONO_FONT } from "../../theme"
import { BlobPane } from "../BlobPane"

// Git Extensions FormResolveConflicts: the unmerged files, what kind of
// conflict each one is, and the four ways out per file (take one side, open
// the mergetool, mark resolved, delete). The stage numbers are git's, so the
// buttons are stage-based; only the labels swap during a rebase, where
// git's "ours" is the branch being rebased onto and "theirs" is your own
// commit being replayed.

const KIND_TEXT: Record<string, string> = {
  "both-modified": "modified on both sides",
  "added-by-both": "added on both sides",
  "deleted-by-us": "deleted by us, modified by them",
  "deleted-by-them": "modified by us, deleted by them",
  "added-by-us": "added by us",
  "added-by-them": "added by them",
  "both-deleted": "deleted on both sides",
}

type Side = { label: string; stage: ConflictStage; testid: string }

function sides(rebasing: boolean): Side[] {
  return [
    { label: "Base", stage: 1, testid: "base" },
    { label: rebasing ? "Onto (ours)" : "Local (ours)", stage: 2, testid: "ours" },
    { label: rebasing ? "Replayed commit (theirs)" : "Remote (theirs)", stage: 3, testid: "theirs" },
  ]
}

export function ResolveConflictsDialog({
  open,
  status,
  busy,
  onClose,
  onResolve,
  onMergetool,
  onRescan,
  onContinue,
  onSkip,
  onAbort,
}: {
  open: boolean
  status: RepoStatus | null
  busy?: boolean
  onClose: () => void
  onResolve: (paths: string[], take: "ours" | "theirs" | "base" | "mark" | "delete") => Promise<void>
  onMergetool: (path: string) => Promise<void>
  onRescan: () => Promise<void>
  onContinue: () => Promise<void>
  onSkip: () => Promise<void>
  onAbort: () => void
}) {
  const engine = useEngine()
  // Memoised: the effect below keeps the selection valid, and a fresh []
  // on every render would re-run it forever.
  const conflicts: ConflictFile[] = useMemo(() => status?.conflicts ?? [], [status])
  const rebasing = status?.state === "rebasing"
  const skippable = status?.state !== "merging"
  const [selected, setSelected] = useState<string | null>(null)
  const [stage, setStage] = useState<ConflictStage>(2)
  const [preview, setPreview] = useState<DiffDto | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) setSelected(null)
  }, [open])

  // Keep the selection on a path that still conflicts; resolving the last
  // one leaves an empty list rather than a stale preview.
  useEffect(() => {
    if (selected && !conflicts.some((c) => c.path === selected)) setSelected(null)
  }, [conflicts, selected])

  useEffect(() => {
    if (!open || !selected) {
      setPreview(null)
      return
    }
    let cancelled = false
    setPreviewError(null)
    engine
      .conflictBlob(selected, stage)
      .then((blob) => {
        if (!cancelled) setPreview(blob)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setPreview(null)
          setPreviewError(describeThrown(e))
        }
      })
    return () => {
      cancelled = true
    }
  }, [engine, open, selected, stage])

  const act = (path: string, take: "ours" | "theirs" | "base" | "mark" | "delete") => () => {
    void onResolve([path], take)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth data-testid="resolve-conflicts-dialog">
      <DialogTitle sx={{ fontSize: 15 }}>
        {conflicts.length === 0
          ? "No unresolved conflicts"
          : `Unresolved merge conflicts (${conflicts.length} file${conflicts.length === 1 ? "" : "s"})`}
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1, minHeight: 320 }}>
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, overflow: "auto", maxHeight: 260 }}>
          {conflicts.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>
              Every conflict is resolved. Continue to finish the operation.
            </Typography>
          ) : (
            conflicts.map((c) => (
              <Box
                key={c.path}
                data-testid="conflict-row"
                data-path={c.path}
                data-kind={c.kind}
                onClick={() => setSelected(c.path)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1,
                  py: 0.5,
                  cursor: "default",
                  bgcolor: selected === c.path ? "action.selected" : undefined,
                  "&:hover": { bgcolor: selected === c.path ? "action.selected" : "action.hover" },
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography noWrap sx={{ fontFamily: MONO_FONT, fontSize: 12 }}>
                    {c.path}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {KIND_TEXT[c.kind] ?? c.kind}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  data-testid="conflict-take-base"
                  disabled={busy || !c.hasBase}
                  onClick={act(c.path, "base")}
                >
                  Base
                </Button>
                <Button
                  size="small"
                  data-testid="conflict-take-ours"
                  disabled={busy || !c.hasOurs}
                  onClick={act(c.path, "ours")}
                >
                  {rebasing ? "Onto" : "Local"}
                </Button>
                <Button
                  size="small"
                  data-testid="conflict-take-theirs"
                  disabled={busy || !c.hasTheirs}
                  onClick={act(c.path, "theirs")}
                >
                  {rebasing ? "Replayed" : "Remote"}
                </Button>
                <Button
                  size="small"
                  data-testid="conflict-mergetool"
                  disabled={busy}
                  onClick={() => void onMergetool(c.path)}
                >
                  Mergetool
                </Button>
                <Button size="small" data-testid="conflict-mark-resolved" disabled={busy} onClick={act(c.path, "mark")}>
                  Mark resolved
                </Button>
                <Button
                  size="small"
                  color="error"
                  data-testid="conflict-delete"
                  disabled={busy}
                  onClick={act(c.path, "delete")}
                >
                  Delete
                </Button>
              </Box>
            ))
          )}
        </Box>

        {selected && (
          <>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0 }} noWrap>
                {selected}
              </Typography>
              {sides(rebasing).map((s) => (
                <Button
                  key={s.stage}
                  size="small"
                  variant={stage === s.stage ? "contained" : "text"}
                  data-testid={`conflict-view-${s.testid}`}
                  onClick={() => setStage(s.stage)}
                >
                  {s.label}
                </Button>
              ))}
            </Box>
            <Box sx={{ display: "flex", minHeight: 160, maxHeight: 260, overflow: "hidden" }}>
              {previewError ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 1 }} data-testid="conflict-preview-error">
                  This side does not exist for that file ({previewError}).
                </Typography>
              ) : (
                <BlobPane blob={preview} path={selected} />
              )}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button size="small" data-testid="conflict-rescan" disabled={busy} onClick={() => void onRescan()}>
          Rescan
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button size="small" color="error" data-testid="conflict-abort" disabled={busy} onClick={onAbort}>
          Abort
        </Button>
        {skippable && (
          <Button size="small" data-testid="conflict-skip" disabled={busy} onClick={() => void onSkip()}>
            Skip
          </Button>
        )}
        <Button
          size="small"
          variant="contained"
          data-testid="conflict-continue"
          disabled={busy || conflicts.length > 0}
          title={conflicts.length > 0 ? "Resolve every file first." : undefined}
          onClick={() => void onContinue()}
        >
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  )
}

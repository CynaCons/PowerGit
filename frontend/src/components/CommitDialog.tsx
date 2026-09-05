import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogContent from "@mui/material/DialogContent"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { shortcutLabel, useHotkeyLayer } from "../hotkeys"
import { describeThrown, isAbort, useEngine, type DiffDto, type DiffOptions, type RepoStatus } from "../engine"
import { DiffOptionsBar } from "./DiffOptionsBar"
import { DiffView } from "./DiffView"
import { IgnoreDialog } from "./IgnoreDialog"
import { FileListBox, ListHeader } from "./CommitFileLists"
import { CommitFileContextMenu } from "./CommitFileContextMenu"
import { useCommitFiles } from "../hooks/useCommitFiles"
import { copyToClipboard } from "./clipboard"
import { ConfirmDialog } from "./dialogs/ConfirmDialog"
import { CommitDiffContextMenu } from "./CommitDiffContextMenu"
import { useDiffLineSelection } from "../hooks/useDiffLineSelection"

type Props = {
  open: boolean
  status: RepoStatus | null
  amend?: boolean
  initialMessage?: string
  onClose: () => void
  onStatus: (status: RepoStatus) => void
  onCommit: (message: string) => Promise<void>
}

// Layout mirrors Git Extensions FormCommit: unstaged/staged lists stacked on
// the left, selected-file diff on the right, commit message bottom-right.
// Selection follows GE: click selects, ctrl+click toggles, shift+click ranges,
// double-click stages/unstages. Right-click opens the file context menu.
export function CommitDialog({ open, status, amend, initialMessage, onClose, onStatus, onCommit }: Props) {
  const engine = useEngine()
  const [diff, setDiff] = useState<DiffDto | null>(null)
  const [diffOpts, setDiffOpts] = useState<DiffOptions>({ context: 3, ws: false, full: false })
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [ignoreFor, setIgnoreFor] = useState<string | null>(null)
  const files = useCommitFiles({ engine, status, onStatus, onError: setError })
  const { selected, selUnstaged, selStaged, menu, setMenu, confirm, setConfirm } = files
  const { clickRow, toggle, stageSelection, stageAll, askConfirm, runConfirmed, openMenu } = files
  const [confirmLines, setConfirmLines] = useState<string | null>(null)
  const [diffTick, setDiffTick] = useState(0)

  useEffect(() => {
    if (!open) return
    files.clear()
    setDiff(null)
    setMessage(amend ? (initialMessage ?? "") : "")
    setError(null)
    setMenu(null)
    // `files` is a fresh object every render; only `open` should retrigger this reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, amend, initialMessage])

  useEffect(() => {
    if (!selected) {
      setDiff(null)
      return
    }
    // Latest selection wins: the previous request is aborted (and its git
    // process killed engine-side) instead of merely ignored.
    const ctrl = new AbortController()
    engine
      .workTreeDiff(selected.path, selected.staged, diffOpts, ctrl.signal)
      .then((d) => {
        if (!ctrl.signal.aborted) setDiff(d)
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || isAbort(e)) return
        setDiff({
          path: selected.path,
          text: `diff failed: ${describeThrown(e)}`,
          binary: false,
          sizeBytes: 0,
          truncated: false,
          truncatedReason: null,
        })
      })
    return () => ctrl.abort()
  }, [engine, selected, diffOpts, diffTick])

  const lines = useDiffLineSelection({
    engine,
    diff,
    onStatus,
    onError: setError,
    onApplied: () => setDiffTick((t) => t + 1),
  })

  async function ignorePattern(pattern: string) {
    onStatus(await engine.addToIgnore(pattern))
    setIgnoreFor(null)
  }

  const canCommit = Boolean(message.trim()) && (status?.stagedCount ?? 0) > 0

  useHotkeyLayer(
    "commit",
    {
      "diff.stageSelected": () => {
        const testid = document.activeElement?.closest("[data-hotkey-surface='file-list']")?.getAttribute("data-testid")
        if (testid === "unstaged-list") void stageSelection(false)
      },
      "diff.unstageSelected": () => {
        const testid = document.activeElement?.closest("[data-hotkey-surface='file-list']")?.getAttribute("data-testid")
        if (testid === "staged-list") void stageSelection(true)
      },
    },
    open,
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      data-testid="commit-overlay"
      slotProps={{
        paper: {
          sx: {
            width: "min(96vw, 1100px)",
            height: "min(80vh, 720px)",
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      <DialogContent sx={{ display: "flex", gap: 2, p: 2, flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Box
          sx={{
            width: 340,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 1,
            userSelect: "none",
            minHeight: 0,
          }}
        >
          <ListHeader label={`Unstaged (${status?.unstagedCount ?? 0})`} />
          <FileListBox
            testid="unstaged-list"
            staged={false}
            files={status?.unstaged ?? []}
            selected={selUnstaged}
            emptyText="Working tree clean."
            onClick={(_f, i, e) => clickRow(status?.unstaged ?? [], false, i, e)}
            onToggle={toggle}
            onContext={(f, x, y) => openMenu(f, false, x, y)}
          />
          <Box
            data-testid="commit-stage-bar"
            sx={{ display: "flex", justifyContent: "space-between", gap: 0.5, flexShrink: 0 }}
          >
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Button
                size="small"
                data-testid="stage-selected"
                disabled={selUnstaged.size === 0}
                onClick={() => void stageSelection(false)}
              >
                Stage
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                  {shortcutLabel("diff.stageSelected")}
                </Typography>
              </Button>
              <Button
                size="small"
                data-testid="stage-all"
                disabled={(status?.unstagedCount ?? 0) === 0}
                onClick={() => void stageAll(false)}
              >
                Stage all
              </Button>
            </Box>
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Button
                size="small"
                data-testid="unstage-selected"
                disabled={selStaged.size === 0}
                onClick={() => void stageSelection(true)}
              >
                Unstage
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                  {shortcutLabel("diff.unstageSelected")}
                </Typography>
              </Button>
              <Button
                size="small"
                data-testid="unstage-all"
                disabled={(status?.stagedCount ?? 0) === 0}
                onClick={() => void stageAll(true)}
              >
                Unstage all
              </Button>
            </Box>
          </Box>
          <ListHeader label={`Staged (${status?.stagedCount ?? 0})`} />
          <FileListBox
            testid="staged-list"
            staged={true}
            files={status?.staged ?? []}
            selected={selStaged}
            emptyText="Nothing staged. Double-click an unstaged file or use Stage."
            onClick={(_f, i, e) => clickRow(status?.staged ?? [], true, i, e)}
            onToggle={toggle}
            onContext={(f, x, y) => openMenu(f, true, x, y)}
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1, minHeight: 0 }}>
          <Box sx={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Box
              data-testid="commit-diff"
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                p: 1.5,
              }}
            >
              {diff ? (
                <DiffView
                  diff={diff}
                  selection={lines.lineSel}
                  onLineClick={lines.clickLine}
                  onLineContextMenu={lines.openMenu}
                />
              ) : (
                <Typography color="text.secondary">Select a file to see its diff.</Typography>
              )}
            </Box>
            <DiffOptionsBar options={diffOpts} onChange={setDiffOpts} />
          </Box>
          <Typography variant="body2" color="error" sx={{ minHeight: 20, flexShrink: 0 }}>
            {error ?? "\u00a0"}
          </Typography>
          <TextField
            data-testid="commit-message"
            fullWidth
            multiline
            minRows={3}
            maxRows={4}
            placeholder="Commit message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            slotProps={{ htmlInput: { "data-testid": "commit-message-input" } }}
            sx={{ flexShrink: 0 }}
          />
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, flexShrink: 0 }}>
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
              {amend ? "Amend" : "Commit"}
            </Button>
          </Box>
        </Box>
      </DialogContent>

      <CommitFileContextMenu
        target={menu}
        onClose={() => setMenu(null)}
        actions={{
          onStage: () => void stageSelection(menu?.staged ?? false),
          onReset: () => askConfirm("reset", menu?.staged ?? false),
          onDelete: () => askConfirm("delete", menu?.staged ?? false),
          onDifftool: () => {
            if (menu) void engine.openWorkTreeDifftool(menu.path, menu.staged).catch((e) => setError(describeThrown(e)))
          },
          onCopyPath: () => {
            const paths = [...((menu?.staged ?? false) ? selStaged : selUnstaged)]
            void copyToClipboard((paths.length > 0 ? paths : menu ? [menu.path] : []).join("\n"))
          },
          onIgnore: () => {
            if (menu) setIgnoreFor(menu.path)
          },
        }}
      />
      <CommitDiffContextMenu
        target={lines.menu}
        staged={selected?.staged ?? false}
        selectedChanges={lines.selectedChanges}
        blocked={lines.blocked}
        onClose={lines.closeMenu}
        onStage={() => void lines.apply(selected?.staged ? "unstage" : "stage")}
        onReset={() => setConfirmLines(lines.patchFor("reset"))}
      />
      <ConfirmDialog
        open={confirmLines !== null}
        testid="reset-lines-confirm"
        title="Reset selected lines"
        text={`Discard ${lines.selectedChanges === 1 ? "the selected change" : `${lines.selectedChanges} selected changes`} in ${selected?.path ?? "this file"}? The working tree is rewritten; this cannot be undone.`}
        confirmLabel="Reset lines"
        destructive
        onConfirm={() => {
          setConfirmLines(null)
          void lines.apply("reset")
        }}
        onCancel={() => setConfirmLines(null)}
      />
      <ConfirmDialog
        open={confirm !== null}
        testid={confirm?.kind === "reset" ? "reset-files-confirm" : "delete-files-confirm"}
        title={confirm?.kind === "reset" ? "Reset to HEAD" : "Delete files"}
        text={
          confirm?.kind === "reset"
            ? `Discard the changes of ${confirm.paths.length === 1 ? confirm.paths[0] : `${confirm.paths.length} files`}?
Tracked files go back to HEAD; new files are deleted. This cannot be undone.`
            : `Delete ${confirm?.paths.length === 1 ? confirm.paths[0] : `${confirm?.paths.length ?? 0} files`} from the working tree? This cannot be undone.`
        }
        confirmLabel={confirm?.kind === "reset" ? "Reset" : "Delete"}
        destructive
        onConfirm={() => void runConfirmed()}
        onCancel={() => setConfirm(null)}
      />

      {ignoreFor !== null && (
        <IgnoreDialog open initialPattern={ignoreFor} onClose={() => setIgnoreFor(null)} onConfirm={ignorePattern} />
      )}
    </Dialog>
  )
}

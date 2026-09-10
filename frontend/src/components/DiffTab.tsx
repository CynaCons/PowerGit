import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined"
import ViewListOutlinedIcon from "@mui/icons-material/ViewListOutlined"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import { CompactFileList } from "./CompactFileList"
import { ConfirmDialog } from "./dialogs/ConfirmDialog"
import { DiffFileContextMenu, DiffLineContextMenu } from "./DiffContextMenus"
import { DiffPane } from "./DiffPane"
import { SplitHandle } from "./SplitHandle"
import { copyToClipboard } from "./clipboard"
import type { BrowseRow } from "./browseReset"
import type { Loadable } from "./loadable"
import { useEngine, type DiffDto, type DiffOptions, type FileChange, type RepoStatus } from "../engine"
import { useBrowseReset, type BrowseResetNote } from "../hooks/useBrowseReset"

// The bottom panel's Diff tab: the file list, the split handle and the diff,
// plus (v0.15.5) the two right-click menus over them. Split out of
// BottomPanel.tsx, which was one line under the god-component limit.
//
// Owner: "when I'm in the diff view, I should be able to right click on a
// file and hit reset. Same for the diff in the diff view. Should be able to
// select some line, and hit reset." The panel was review-only until now
// (pendingRows.ts: "Review only; staging lives in the commit dialog"), so
// this file is where that stops being true — and where every mutation is
// confirmed, because "reset" means three different things depending on which
// row the graph has selected (browseReset.ts).

export type DiffTabActions = { setStatus: (status: RepoStatus) => void }

export function DiffTab({
  files,
  selectedPath,
  onSelect,
  treeMode,
  onToggleTreeMode,
  filesWidth,
  splitHandleProps,
  diff,
  busy,
  options,
  onOptions,
  onRetry,
  onOpenDifftool,
  difftoolError,
  row,
  commitId,
  actions,
}: {
  files: FileChange[]
  selectedPath: string | null
  onSelect: (path: string) => void
  treeMode: boolean
  onToggleTreeMode: () => void
  filesWidth: number
  splitHandleProps: React.ComponentProps<typeof SplitHandle>
  diff: Loadable<DiffDto>
  busy: boolean
  options: DiffOptions
  onOptions: (o: DiffOptions) => void
  onRetry: () => void
  onOpenDifftool: (path: string) => void
  difftoolError: string | null
  /** Which of the three diffs is on screen, or null when nothing is selected. */
  row: BrowseRow | null
  commitId: string | null
  /** Absent in demo mode and wherever the panel must stay read-only. */
  actions?: DiffTabActions
}) {
  const engine = useEngine()
  const [note, setNote] = useState<BrowseResetNote | null>(null)
  const ready = diff.kind === "ready" ? diff.value : null
  const reset = useBrowseReset({
    engine,
    row: actions ? row : null,
    diff: ready,
    diffOptions: options,
    files,
    commitId,
    onStatus: (status) => actions?.setStatus(status),
    onNote: setNote,
  })
  const enabled = actions !== undefined && row !== null

  return (
    <>
      <Box
        sx={{
          width: filesWidth,
          flexShrink: 0,
          // The list scrolls inside; the mode button below is anchored
          // to this box's visible bottom, not to the scrolled content
          // (v0.14.1, owner: floating buttons that "disappear").
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <CompactFileList
          testid="file-list"
          files={files}
          tree={treeMode}
          selectedPath={selectedPath}
          emptyText="No files for this revision."
          onSelect={(f) => onSelect(f.path)}
          onRowDoubleClick={(f) => onOpenDifftool(f.path)}
          onRowContext={
            enabled
              ? (f, _index, x, y) => {
                  onSelect(f.path)
                  reset.openFileMenu(f.path, x, y)
                }
              : undefined
          }
        />
        {difftoolError && (
          <Typography
            data-testid="difftool-error"
            variant="caption"
            color="error"
            sx={{ px: 1, py: 0.5, flexShrink: 0 }}
          >
            {difftoolError}
          </Typography>
        )}
        {note && (
          <Typography
            data-testid="diff-action-note"
            data-level={note.level}
            variant="caption"
            color={note.level === "error" ? "error" : "text.secondary"}
            sx={{ px: 1, py: 0.5, flexShrink: 0 }}
          >
            {note.text}
          </Typography>
        )}
        {/* Owner (v0.13.16): "a floating transparent button to activate a
            mode 'hierarchical' view" — flat paths or a directory tree. */}
        <Tooltip title={treeMode ? "Show full paths" : "Group by directory"} placement="left">
          <IconButton
            size="small"
            data-testid="file-list-mode"
            aria-label={treeMode ? "Show full paths" : "Group by directory"}
            onClick={onToggleTreeMode}
            sx={{
              position: "absolute",
              right: 10,
              bottom: 8,
              bgcolor: "rgba(21, 83, 201, 0.10)",
              color: "primary.main",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              border: 1,
              borderColor: "divider",
              "&:hover": { bgcolor: "rgba(21, 83, 201, 0.22)" },
            }}
          >
            {treeMode ? <ViewListOutlinedIcon fontSize="small" /> : <AccountTreeOutlinedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
      <SplitHandle {...splitHandleProps} />
      <DiffPane
        diff={diff}
        busy={busy}
        file={selectedPath}
        options={options}
        onOptions={onOptions}
        onRetry={onRetry}
        onOpenDifftool={selectedPath ? () => onOpenDifftool(selectedPath) : undefined}
        selection={enabled ? reset.lines.lineSel : undefined}
        onLineClick={enabled ? reset.lines.clickLine : undefined}
        onLineContextMenu={enabled ? reset.lines.openMenu : undefined}
      />
      {enabled && row && (
        <>
          <DiffFileContextMenu
            target={reset.fileMenu}
            row={row}
            plan={reset.filePlan}
            blocked={reset.fileBlocked}
            onClose={reset.closeFileMenu}
            onReset={reset.askFileReset}
            onDifftool={() => reset.fileMenu && onOpenDifftool(reset.fileMenu.path)}
            onCopyPath={() => void copyToClipboard(reset.fileMenu?.path ?? "")}
          />
          <DiffLineContextMenu
            target={reset.lines.menu}
            row={row}
            plan={reset.linePlan}
            selectedChanges={reset.lines.selectedChanges}
            selectedRows={reset.lines.lineSel.size}
            blocked={reset.lines.blocked}
            onClose={reset.lines.closeMenu}
            onReset={reset.askLineReset}
            onCopy={() => void copyToClipboard(reset.lines.selectedText())}
          />
          <ConfirmDialog
            open={reset.confirm !== null}
            testid="diff-reset-confirm"
            title={reset.confirm?.title ?? ""}
            text={reset.confirm?.text ?? ""}
            confirmLabel={reset.confirm?.confirmLabel ?? "Reset"}
            destructive={reset.confirm?.destructive ?? true}
            onConfirm={() => void reset.runConfirmed()}
            onCancel={reset.cancelConfirm}
          />
        </>
      )}
    </>
  )
}

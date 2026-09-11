import CompareIcon from "@mui/icons-material/Compare"
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import SettingsBackupRestoreIcon from "@mui/icons-material/SettingsBackupRestore"
import UndoIcon from "@mui/icons-material/Undo"
import Divider from "@mui/material/Divider"
import ListItemIcon from "@mui/material/ListItemIcon"
import ListItemText from "@mui/material/ListItemText"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import type { ReactNode } from "react"
import type { BrowseRow, FilePlan, LinePlan } from "./browseReset"

// Right-click menus of the Browse panel's Diff tab (v0.15.5). Owner: "when
// I'm in the diff view, I should be able to right click on a file and hit
// reset. Same for the diff in the diff view. Should be able to select some
// line, and hit reset."
//
// Same house style as the commit dialog's menus (CommitFileContextMenu): an
// icon on every row, a shortcut column, separators between groups, and items
// disabled with a tooltip rather than hidden — a menu whose shape changes
// between two similar rows is a menu the user cannot learn. Labels come from
// browseReset.ts, because "reset" means a different git operation on each of
// the three rows this panel can show.

export type DiffMenuTarget = { x: number; y: number }
export type DiffFileMenuTarget = DiffMenuTarget & { path: string }

function Item({
  testid,
  icon,
  label,
  disabled,
  hint,
  onClick,
}: {
  testid: string
  icon: ReactNode
  label: string
  disabled?: boolean
  /** Shown on hover; the reason when `disabled`. */
  hint?: string
  onClick: () => void
}) {
  return (
    <Tooltip title={hint ?? ""} placement="right" disableInteractive>
      <span>
        <MenuItem data-testid={testid} disabled={disabled} onClick={onClick} dense>
          <ListItemIcon>{icon}</ListItemIcon>
          <ListItemText>{label}</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ pl: 3, minWidth: 24 }} />
        </MenuItem>
      </span>
    </Tooltip>
  )
}

function Frame({
  target,
  testid,
  onClose,
  children,
}: {
  target: DiffMenuTarget | null
  testid: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Menu
      transitionDuration={0}
      open={target !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={target ? { top: target.y, left: target.x } : undefined}
      slotProps={{ paper: { sx: { minWidth: 260 } } }}
      data-testid={testid}
    >
      {children}
    </Menu>
  )
}

export function DiffFileContextMenu({
  target,
  row,
  plan,
  blocked,
  onClose,
  onReset,
  onDifftool,
  onCopyPath,
}: {
  target: DiffFileMenuTarget | null
  row: BrowseRow
  plan: FilePlan
  /** Why the reset cannot run for this file, or null. */
  blocked: string | null
  onClose: () => void
  onReset: () => void
  onDifftool: () => void
  onCopyPath: () => void
}) {
  const run = (action: () => void) => () => {
    onClose()
    action()
  }
  return (
    <Frame target={target} testid="diff-file-menu" onClose={onClose}>
      <Item
        testid="ctx-diff-reset-file"
        icon={row.kind === "commit" ? <UndoIcon fontSize="small" /> : <SettingsBackupRestoreIcon fontSize="small" />}
        label={plan.label}
        disabled={blocked !== null}
        hint={blocked ?? undefined}
        onClick={run(onReset)}
      />
      <Divider />
      <Item
        testid="ctx-diff-difftool"
        icon={<CompareIcon fontSize="small" />}
        label="Open with difftool"
        onClick={run(onDifftool)}
      />
      <Item
        testid="ctx-diff-copy-path"
        icon={<ContentCopyIcon fontSize="small" />}
        label="Copy path"
        onClick={run(onCopyPath)}
      />
    </Frame>
  )
}

export function DiffLineContextMenu({
  target,
  row,
  plan,
  selectedChanges,
  selectedRows,
  blocked,
  onClose,
  onReset,
  onCopy,
}: {
  target: DiffMenuTarget | null
  row: BrowseRow
  plan: LinePlan
  /** Number of selected "+"/"-" lines. */
  selectedChanges: number
  /** Number of selected rows, context lines included. */
  selectedRows: number
  /** Why line actions are unavailable for this diff (binary, truncated, -w…), or null. */
  blocked: string | null
  onClose: () => void
  onReset: () => void
  onCopy: () => void
}) {
  const none = selectedChanges === 0
  const hint = blocked ?? (none ? "Select changed lines first (click, Shift+click, Ctrl+click)" : undefined)
  return (
    <Frame target={target} testid="diff-line-menu" onClose={onClose}>
      <Item
        testid="ctx-diff-reset-lines"
        icon={row.kind === "commit" ? <UndoIcon fontSize="small" /> : <SettingsBackupRestoreIcon fontSize="small" />}
        label={plan.label}
        disabled={none || blocked !== null}
        hint={hint}
        onClick={() => {
          onClose()
          onReset()
        }}
      />
      <Divider />
      {/* Copies the selected rows with their "+"/"-" markers (v0.15.5). Since
          v0.16.0 the diff is also plain selectable text, and Ctrl+C over a
          text selection copies clean code (DiffView). */}
      <Item
        testid="ctx-diff-copy-lines"
        icon={<ContentCopyOutlinedIcon fontSize="small" />}
        label={selectedRows === 1 ? "Copy selected line" : `Copy selected ${selectedRows} lines`}
        disabled={selectedRows === 0}
        hint={selectedRows === 0 ? "Select lines first (click, Shift+click, Ctrl+click)" : undefined}
        onClick={() => {
          onClose()
          onCopy()
        }}
      />
    </Frame>
  )
}

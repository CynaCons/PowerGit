import AddIcon from "@mui/icons-material/Add"
import RemoveIcon from "@mui/icons-material/Remove"
import SettingsBackupRestoreIcon from "@mui/icons-material/SettingsBackupRestore"
import Divider from "@mui/material/Divider"
import ListItemIcon from "@mui/material/ListItemIcon"
import ListItemText from "@mui/material/ListItemText"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import type { ReactNode } from "react"

// Context menu of the commit dialog's diff (v0.13.14). Owner: "in the commit
// view, we can select a piece of diff and reset it like we can in baseline
// Git Extensions." Git Extensions' FormCommit offers Stage / Reset selected
// lines on the unstaged diff and Unstage selected lines on the staged one;
// same items here, same house style as the file menu.

export type CommitDiffMenuTarget = { x: number; y: number }

export function CommitDiffContextMenu({
  target,
  staged,
  selectedChanges,
  blocked,
  onClose,
  onStage,
  onReset,
}: {
  target: CommitDiffMenuTarget | null
  staged: boolean
  /** Number of selected "+"/"-" lines. */
  selectedChanges: number
  /** Why line actions are unavailable for this diff (binary, new file…), or null. */
  blocked: string | null
  onClose: () => void
  onStage: () => void
  onReset: () => void
}) {
  const none = selectedChanges === 0
  const disabled = none || blocked !== null
  const hint = blocked ?? (none ? "Select changed lines first (click, Shift+click, Ctrl+click)" : "")
  const lines = selectedChanges === 1 ? "line" : `${selectedChanges} lines`
  const run = (a: () => void) => () => {
    onClose()
    a()
  }
  const item = (testid: string, icon: ReactNode, label: string, onClick: () => void) => (
    <Tooltip title={hint} placement="right" disableInteractive>
      <span>
        <MenuItem data-testid={testid} disabled={disabled} onClick={onClick} dense>
          <ListItemIcon>{icon}</ListItemIcon>
          <ListItemText>{label}</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ pl: 3, minWidth: 24 }} />
        </MenuItem>
      </span>
    </Tooltip>
  )
  return (
    <Menu
      transitionDuration={0}
      open={target !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={target ? { top: target.y, left: target.x } : undefined}
      slotProps={{ paper: { sx: { minWidth: 240 } } }}
      data-testid="commit-diff-menu"
    >
      {staged
        ? item("ctx-unstage-lines", <RemoveIcon fontSize="small" />, `Unstage selected ${lines}`, run(onStage))
        : item("ctx-stage-lines", <AddIcon fontSize="small" />, `Stage selected ${lines}`, run(onStage))}
      {!staged && <Divider />}
      {!staged &&
        item(
          "ctx-reset-lines",
          <SettingsBackupRestoreIcon fontSize="small" />,
          `Reset selected ${lines}…`,
          run(onReset),
        )}
    </Menu>
  )
}

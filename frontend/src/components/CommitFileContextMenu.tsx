import AddIcon from "@mui/icons-material/Add"
import BlockIcon from "@mui/icons-material/Block"
import CompareIcon from "@mui/icons-material/Compare"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined"
import RemoveIcon from "@mui/icons-material/Remove"
import SettingsBackupRestoreIcon from "@mui/icons-material/SettingsBackupRestore"
import Divider from "@mui/material/Divider"
import ListItemIcon from "@mui/material/ListItemIcon"
import ListItemText from "@mui/material/ListItemText"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Typography from "@mui/material/Typography"
import type { ReactNode } from "react"
import { shortcutLabel } from "../hotkeys"

// Context menu of a file in the commit dialog (v0.13.14). Owner report:
// "the right click menu on the unstaged files is not professional. Very
// poor." Item set and order follow Git Extensions' FileStatusList menu in
// FormCommit (Stage/Unstage · Reset to HEAD, Delete · Open with difftool,
// Copy path · Add to .gitignore), in the RevisionContextMenu house style:
// an icon on every row, a shortcut column, separators between groups, and
// items disabled rather than hidden when they do not apply.

export type CommitFileMenuTarget = { x: number; y: number; staged: boolean; path: string; count: number }

export type CommitFileMenuActions = {
  onStage: () => void
  onReset: () => void
  onDelete: () => void
  onDifftool: () => void
  onCopyPath: () => void
  onIgnore: () => void
}

function Item({
  testid,
  icon,
  label,
  shortcut,
  disabled,
  onClick,
}: {
  testid: string
  icon: ReactNode
  label: string
  shortcut?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <MenuItem data-testid={testid} disabled={disabled} onClick={onClick} dense>
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText>{label}</ListItemText>
      <Typography variant="caption" color="text.secondary" sx={{ pl: 3, minWidth: 40, textAlign: "right" }}>
        {shortcut ?? ""}
      </Typography>
    </MenuItem>
  )
}

export function CommitFileContextMenu({
  target,
  onClose,
  actions,
}: {
  target: CommitFileMenuTarget | null
  onClose: () => void
  actions: CommitFileMenuActions
}) {
  const open = target !== null
  const staged = target?.staged ?? false
  const n = target?.count ?? 1
  const files = n === 1 ? "file" : `${n} files`
  const run = (action: () => void) => () => {
    onClose()
    action()
  }
  return (
    <Menu
      transitionDuration={0}
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={target ? { top: target.y, left: target.x } : undefined}
      slotProps={{ paper: { id: "commit-file-context-menu", sx: { minWidth: 260 } } }}
      data-testid="commit-file-menu"
    >
      <Item
        testid="ctx-stage-selected"
        icon={staged ? <RemoveIcon fontSize="small" /> : <AddIcon fontSize="small" />}
        label={staged ? `Unstage ${files}` : `Stage ${files}`}
        shortcut={shortcutLabel(staged ? "diff.unstageSelected" : "diff.stageSelected")}
        onClick={run(actions.onStage)}
      />
      <Divider />
      <Item
        testid="ctx-reset-file"
        icon={<SettingsBackupRestoreIcon fontSize="small" />}
        label={`Reset ${files} to HEAD…`}
        onClick={run(actions.onReset)}
      />
      <Item
        testid="ctx-delete-file"
        icon={<DeleteOutlineIcon fontSize="small" />}
        label={`Delete ${files}…`}
        onClick={run(actions.onDelete)}
      />
      <Divider />
      <Item
        testid="ctx-difftool"
        icon={<CompareIcon fontSize="small" />}
        label="Open with difftool"
        disabled={n !== 1}
        onClick={run(actions.onDifftool)}
      />
      <Item
        testid="ctx-copy-path"
        icon={<ContentCopyIcon fontSize="small" />}
        label={n === 1 ? "Copy path" : "Copy paths"}
        onClick={run(actions.onCopyPath)}
      />
      <Divider />
      <Item
        testid="ctx-ignore-file"
        icon={<BlockIcon fontSize="small" />}
        label="Add to .gitignore…"
        disabled={staged || n !== 1}
        onClick={run(actions.onIgnore)}
      />
    </Menu>
  )
}

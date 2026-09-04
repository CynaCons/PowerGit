import BuildIcon from "@mui/icons-material/Build"
import CallSplitIcon from "@mui/icons-material/CallSplit"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import ContentPasteGoIcon from "@mui/icons-material/ContentPasteGo"
import SellOutlinedIcon from "@mui/icons-material/SellOutlined"
import SettingsBackupRestoreIcon from "@mui/icons-material/SettingsBackupRestore"
import UndoIcon from "@mui/icons-material/Undo"
import ListItemIcon from "@mui/material/ListItemIcon"
import ListItemText from "@mui/material/ListItemText"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import type { ContextTarget } from "../../hooks/useDialogs"
import { shortcutLabel } from "../../hotkeys"
import { CherryPickDialog } from "./CherryPickDialog"
import { RevertDialog } from "./RevertDialog"

export type { ContextTarget }

export function RevisionContextMenu({
  target,
  branches,
  onClose,
  onCheckout,
  onReset,
  onRebase,
  onCreateBranch,
  onCreateTag,
}: {
  target: ContextTarget | null
  branches: string[]
  onClose: () => void
  onCheckout: (branch: string) => void
  onReset: () => void
  onRebase: () => void
  onCreateBranch: (sha: string) => void
  onCreateTag: (sha: string) => void
}) {
  const localBranches = target ? branches.filter((b) => target.row.rev.refs.includes(b)) : []
  // Cherry-pick/revert have no extra options (unlike checkout/reset), so
  // their confirm dialogs are self-contained here rather than threaded
  // through App-level state: the target commit is captured locally when the
  // menu item is clicked, independent of the menu's own open/close lifecycle.
  const [cherryPickTarget, setCherryPickTarget] = useState<ContextTarget["row"] | null>(null)
  const [revertTarget, setRevertTarget] = useState<ContextTarget["row"] | null>(null)

  // A MUI Menu is a Modal: its root covers the viewport and swallows every
  // pointer event, so a second right-click landed on the modal root instead
  // of the row underneath — the menu just closed and (before App's global
  // handler) the WebView's own menu appeared. Letting pointer events through
  // the root, while keeping them on the paper, makes right-clicking another
  // row re-target the menu in one gesture, the way a desktop app behaves.
  // Click-away then has to be wired up by hand, since it normally rides on
  // the backdrop that no longer receives anything.
  const open = target !== null
  useEffect(() => {
    if (!open) return
    const closeIfOutside = (e: Event) => {
      const el = e.target as HTMLElement | null
      if (el?.closest("#revision-context-menu")) return
      onClose()
    }
    document.addEventListener("mousedown", closeIfOutside, true)
    document.addEventListener("contextmenu", closeIfOutside, true)
    return () => {
      document.removeEventListener("mousedown", closeIfOutside, true)
      document.removeEventListener("contextmenu", closeIfOutside, true)
    }
  }, [open, onClose])

  return (
    <>
      <Menu
        open={open}
        onClose={onClose}
        anchorReference="anchorPosition"
        anchorPosition={target ? { top: target.y, left: target.x } : undefined}
        slotProps={{
          root: { sx: { pointerEvents: "none" } },
          paper: { id: "revision-context-menu", sx: { pointerEvents: "auto" } },
        }}
      >
        <MenuItem
          data-testid="ctx-checkout"
          disabled={localBranches.length === 0}
          onClick={() => {
            onClose()
            onCheckout(localBranches[0])
          }}
        >
          <ListItemIcon>
            <CallSplitIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Checkout Branch…</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ pl: 2 }}>
            {shortcutLabel("browse.checkoutBranch")}
          </Typography>
        </MenuItem>
        <MenuItem
          data-testid="ctx-create-branch"
          onClick={() => {
            const sha = target!.row.rev.id
            onClose()
            onCreateBranch(sha)
          }}
        >
          <ListItemIcon>
            <CallSplitIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Create Branch Here…</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ pl: 2 }}>
            {shortcutLabel("browse.createBranch")}
          </Typography>
        </MenuItem>
        <MenuItem
          data-testid="ctx-create-tag"
          onClick={() => {
            const sha = target!.row.rev.id
            onClose()
            onCreateTag(sha)
          }}
        >
          <ListItemIcon>
            <SellOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Create Tag Here…</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ pl: 2 }}>
            {shortcutLabel("browse.createTag")}
          </Typography>
        </MenuItem>
        <MenuItem
          data-testid="ctx-reset"
          onClick={() => {
            onClose()
            onReset()
          }}
        >
          <ListItemIcon>
            <UndoIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Reset Current Branch to Here…</ListItemText>
        </MenuItem>
        <MenuItem
          data-testid="ctx-rebase"
          onClick={() => {
            onClose()
            onRebase()
          }}
        >
          <ListItemIcon>
            <BuildIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Rebase Current Branch onto Here…</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ pl: 2 }}>
            {shortcutLabel("browse.rebase")}
          </Typography>
        </MenuItem>
        <MenuItem
          data-testid="ctx-copy-sha"
          onClick={() => {
            if (target) void navigator.clipboard?.writeText(target.row.rev.id)
            onClose()
          }}
        >
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Copy SHA</ListItemText>
        </MenuItem>
        <MenuItem
          data-testid="ctx-cherry-pick"
          onClick={() => {
            const row = target!.row
            onClose()
            setCherryPickTarget(row)
          }}
        >
          <ListItemIcon>
            <ContentPasteGoIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Cherry-pick Here…</ListItemText>
        </MenuItem>
        <MenuItem
          data-testid="ctx-revert"
          onClick={() => {
            const row = target!.row
            onClose()
            setRevertTarget(row)
          }}
        >
          <ListItemIcon>
            <SettingsBackupRestoreIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Revert Commit…</ListItemText>
        </MenuItem>
      </Menu>
      {cherryPickTarget && (
        <CherryPickDialog
          open
          commit={cherryPickTarget.rev.id}
          subject={cherryPickTarget.rev.message}
          onClose={() => setCherryPickTarget(null)}
        />
      )}
      {revertTarget && (
        <RevertDialog
          open
          commit={revertTarget.rev.id}
          subject={revertTarget.rev.message}
          onClose={() => setRevertTarget(null)}
        />
      )}
    </>
  )
}

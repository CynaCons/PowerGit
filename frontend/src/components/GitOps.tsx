import BuildIcon from "@mui/icons-material/Build"
import CallSplitIcon from "@mui/icons-material/CallSplit"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import ContentPasteGoIcon from "@mui/icons-material/ContentPasteGo"
import SellOutlinedIcon from "@mui/icons-material/SellOutlined"
import SettingsBackupRestoreIcon from "@mui/icons-material/SettingsBackupRestore"
import UndoIcon from "@mui/icons-material/Undo"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import FormControlLabel from "@mui/material/FormControlLabel"
import ListItemIcon from "@mui/material/ListItemIcon"
import ListItemText from "@mui/material/ListItemText"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Radio from "@mui/material/Radio"
import RadioGroup from "@mui/material/RadioGroup"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { cherryPickCommit, describeThrown, revertCommit } from "../engine"
import type { GraphRow } from "../graph/types"
import { shortcutLabel } from "../hotkeys"

export type ContextTarget = { x: number; y: number; row: GraphRow }

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

export function CreateRefDialog({
  open,
  kind,
  commit,
  subject,
  existingNames,
  onClose,
  onConfirm,
}: {
  open: boolean
  kind: "branch" | "tag"
  commit: string
  subject?: string
  existingNames: string[]
  onClose: () => void
  onConfirm: (name: string) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName("")
      setError(null)
    }
  }, [open])

  async function run() {
    const clean = name.trim()
    if (!clean) {
      setError(`A ${kind} name is required.`)
      return
    }
    if (existingNames.includes(clean)) {
      setError(`'${clean}' already exists.`)
      return
    }
    try {
      await onConfirm(clean)
      onClose()
    } catch (e) {
      setError(`create ${kind} failed: ${describeThrown(e)}`)
    }
  }

  return (
    <OpDialog
      open={open}
      title={`Create ${kind} at ${commit.slice(0, 7)}${subject ? ` (${subject})` : ""}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={run} data-testid="create-ref-confirm">
            Create {kind}
          </Button>
        </>
      }
    >
      <TextField
        autoFocus
        fullWidth
        size="small"
        label={`${kind === "branch" ? "Branch" : "Tag"} name`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void run()
        }}
        data-testid="create-ref-name"
      />
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
    </OpDialog>
  )
}

function OpDialog({ open, title, onClose, children, actions }: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  actions: React.ReactNode
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>{children}</DialogContent>
      <DialogActions>{actions}</DialogActions>
    </Dialog>
  )
}

export function CheckoutBranchDialog({
  open,
  branch,
  branchOptions,
  dirtyCount,
  onClose,
  onConfirm,
}: {
  open: boolean
  branch: string
  branchOptions: string[]
  dirtyCount: number
  onClose: () => void
  onConfirm: (branch: string, force: boolean) => Promise<void>
}) {
  const [selected, setSelected] = useState(branch)
  const [force, setForce] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSelected(branch)
      setForce(false)
      setError(null)
    }
  }, [open, branch])

  async function run() {
    try {
      await onConfirm(selected, force)
      onClose()
    } catch (e) {
      setError(`checkout failed: ${describeThrown(e)}`)
    }
  }

  return (
    <OpDialog
      open={open}
      title="Checkout Branch"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={run} data-testid="checkout-confirm">
            Checkout
          </Button>
        </>
      }
    >
      {dirtyCount > 0 && (
        <Typography variant="body2" color="warning.main">
          The working tree has {dirtyCount} uncommitted change(s). Force checkout will discard them.
        </Typography>
      )}
      <RadioGroup value={selected} onChange={(e) => setSelected(e.target.value)}>
        {branchOptions.map((b) => (
          <FormControlLabel key={b} value={b} control={<Radio size="small" />} label={b} />
        ))}
      </RadioGroup>
      <FormControlLabel
        control={<Checkbox size="small" checked={force} onChange={(e) => setForce(e.target.checked)} />}
        label="Force (discard local changes)"
      />
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
    </OpDialog>
  )
}

export function ResetBranchDialog({
  open,
  commit,
  subject,
  currentBranch,
  dirtyCount,
  onClose,
  onConfirm,
}: {
  open: boolean
  commit: string
  subject?: string
  currentBranch: string
  dirtyCount: number
  onClose: () => void
  onConfirm: (mode: "soft" | "mixed" | "hard") => Promise<void>
}) {
  const [mode, setMode] = useState<"soft" | "mixed" | "hard">("mixed")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setMode("mixed")
      setError(null)
    }
  }, [open])

  async function run() {
    try {
      await onConfirm(mode)
      onClose()
    } catch (e) {
      setError(`reset failed: ${describeThrown(e)}`)
    }
  }

  return (
    <OpDialog
      open={open}
      title={`Reset branch '${currentBranch}' to ${commit.slice(0, 7)}${subject ? ` (${subject})` : ""}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" color={mode === "hard" ? "error" : "primary"} onClick={run} data-testid="reset-confirm">
            Reset
          </Button>
        </>
      }
    >
      <RadioGroup value={mode} onChange={(e) => setMode(e.target.value as "soft" | "mixed" | "hard")}>
        <FormControlLabel value="soft" control={<Radio size="small" />} label="Soft — keep all changes staged" />
        <FormControlLabel value="mixed" control={<Radio size="small" />} label="Mixed — keep changes in working tree" />
        <FormControlLabel value="hard" control={<Radio size="small" />} label="Hard — discard all working tree changes" />
      </RadioGroup>
      {mode === "hard" && (
        <Typography variant="body2" color="warning.main">
          Warning: hard reset permanently discards{dirtyCount > 0 ? ` ${dirtyCount}` : " all"} uncommitted change(s). This cannot be undone.
        </Typography>
      )}
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
    </OpDialog>
  )
}

export function RebaseDialog({
  open,
  ontoSha,
  ontoSubject,
  currentBranch,
  onClose,
  onConfirm,
}: {
  open: boolean
  ontoSha: string
  ontoSubject?: string
  currentBranch: string
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  async function run() {
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      setError(`rebase failed: ${describeThrown(e)}`)
    }
  }

  return (
    <OpDialog
      open={open}
      title={`Rebase '${currentBranch}'`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={run} data-testid="rebase-confirm">
            Rebase
          </Button>
        </>
      }
    >
      <Typography variant="body2">
        Rebase the current branch <strong>{currentBranch}</strong> onto{" "}
        <Box component="span" sx={{ fontFamily: "Fira Code, ui-monospace, monospace" }}>
          {ontoSha.slice(0, 7)}
        </Box>
        {ontoSubject ? ` (${ontoSubject})` : ""}.
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Commits unique to {currentBranch} will be replayed. If conflicts occur, the rebase is aborted and your branch stays untouched.
      </Typography>
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
    </OpDialog>
  )
}

// Cherry-pick and revert act on a single commit with no extra options, so
// unlike Checkout/Reset/Rebase they call the engine directly instead of
// through an App-supplied onConfirm: `busy` disables the actions while the
// request is in flight and `error` surfaces a failed/conflicted op inline,
// mirroring the try/catch/setError shape those dialogs use.
export function CherryPickDialog({
  open,
  commit,
  subject,
  onClose,
}: {
  open: boolean
  commit: string
  subject?: string
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  async function run() {
    setBusy(true)
    try {
      await cherryPickCommit(commit)
      onClose()
    } catch (e) {
      setError(`cherry-pick failed: ${describeThrown(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <OpDialog
      open={open}
      title={`Cherry-pick ${commit.slice(0, 7)}${subject ? ` (${subject})` : ""}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={run} disabled={busy} data-testid="cherry-pick-confirm">
            {busy ? "Cherry-picking…" : "Cherry-pick"}
          </Button>
        </>
      }
    >
      <Typography variant="body2">
        Apply commit{" "}
        <Box component="span" sx={{ fontFamily: "Fira Code, ui-monospace, monospace" }}>
          {commit.slice(0, 7)}
        </Box>
        {subject ? ` (${subject})` : ""} onto the current branch.
      </Typography>
      <Typography variant="body2" color="text.secondary">
        If conflicts occur, the cherry-pick is aborted and your branch stays untouched.
      </Typography>
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
    </OpDialog>
  )
}

export function RevertDialog({
  open,
  commit,
  subject,
  onClose,
}: {
  open: boolean
  commit: string
  subject?: string
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  async function run() {
    setBusy(true)
    try {
      await revertCommit(commit)
      onClose()
    } catch (e) {
      setError(`revert failed: ${describeThrown(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <OpDialog
      open={open}
      title={`Revert ${commit.slice(0, 7)}${subject ? ` (${subject})` : ""}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={run} disabled={busy} data-testid="revert-confirm">
            {busy ? "Reverting…" : "Revert"}
          </Button>
        </>
      }
    >
      <Typography variant="body2">
        Create a new commit that undoes{" "}
        <Box component="span" sx={{ fontFamily: "Fira Code, ui-monospace, monospace" }}>
          {commit.slice(0, 7)}
        </Box>
        {subject ? ` (${subject})` : ""}.
      </Typography>
      <Typography variant="body2" color="text.secondary">
        If conflicts occur, the revert is aborted and your branch stays untouched.
      </Typography>
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
    </OpDialog>
  )
}

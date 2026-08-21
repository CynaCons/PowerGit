import AddIcon from "@mui/icons-material/Add"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import HistoryIcon from "@mui/icons-material/History"
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined"
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined"
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined"
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined"
import CallReceivedOutlinedIcon from "@mui/icons-material/CallReceivedOutlined"
import AppBar from "@mui/material/AppBar"
import Badge from "@mui/material/Badge"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Toolbar from "@mui/material/Toolbar"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BottomPanel } from "./components/BottomPanel"
import { CommitDialog } from "./components/CommitDialog"
import { CheckoutBranchDialog, RebaseDialog, ResetBranchDialog, RevisionContextMenu, type ContextTarget } from "./components/GitOps"
import { RecentsDialog } from "./components/RecentsDialog"
import { RemoteDialog } from "./components/RemoteDialog"
import { RepoTree } from "./components/RepoTree"
import { RevisionGrid } from "./components/RevisionGrid"
import { SettingsDialog } from "./components/SettingsDialog"
import {
  checkoutRef,
  createCommit,
  deleteBranch,
  deleteTag,
  fetchCurrent,
  fetchHealth,
  fetchRecents,
  fetchRefs,
  fetchRevisions,
  fetchRemote,
  fetchStatus,
  openRepo,
  rebaseOnto,
  resetBranch,
  type Health,
  type RefTree,
  type RepoInfo,
  type RepoStatus,
  type RevisionDto,
} from "./engine"
import { layoutGraph } from "./graph/layout"
import { syntheticHistory } from "./graph/synthetic"
import type { Revision } from "./graph/types"

function toRevision(dto: RevisionDto): Revision {
  return {
    id: dto.id,
    parents: dto.parents,
    message: dto.subject,
    author: dto.author,
    date: dto.date.replace("T", " ").slice(0, 16),
    refs: dto.refs,
  }
}

export default function App() {
  const [revisions, setRevisions] = useState<Revision[]>(() => syntheticHistory(200).map((r) => ({ ...r, id: r.id.length >= 7 ? r.id : r.id.padEnd(7, "0") })))
  const [selected, setSelected] = useState(0)
  const [commitOpen, setCommitOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [recentsOpen, setRecentsOpen] = useState(false)
  const [health, setHealth] = useState<Health | null>(null)
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [refs, setRefs] = useState<RefTree | null>(null)
  const [status, setStatus] = useState<RepoStatus | null>(null)
  const [recents, setRecents] = useState<RepoInfo[]>([])
  const [live, setLive] = useState(false)
  const [bottomHeight, setBottomHeight] = useState(280)
  const [leftOpen, setLeftOpen] = useState(true)
  const [ctxTarget, setCtxTarget] = useState<ContextTarget | null>(null)
  const [checkoutBranch, setCheckoutBranch] = useState<string | null>(null)
  const [resetRow, setResetRow] = useState<ContextTarget["row"] | null>(null)
  const [rebaseRow, setRebaseRow] = useState<ContextTarget["row"] | null>(null)
  const [remoteConfigFor, setRemoteConfigFor] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const dragState = useRef<{ startY: number; startH: number } | null>(null)

  const onDividerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = { startY: e.clientY, startH: bottomHeight }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onDividerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return
    const dy = dragState.current.startY - e.clientY
    const max = (contentRef.current?.clientHeight ?? 600) - 140
    setBottomHeight(Math.min(Math.max(120, dragState.current.startH + dy), Math.max(120, max)))
  }
  const onDividerUp = () => {
    dragState.current = null
  }

  const rows = useMemo(() => layoutGraph(revisions), [revisions])
  const current = rows[selected]
  const dirty = (status?.unstagedCount ?? 0) + (status?.stagedCount ?? 0)

  const refreshRepo = useCallback(async () => {
    const [rev, tree, st] = await Promise.all([fetchRevisions(800), fetchRefs(), fetchStatus()])
    setRevisions(rev.map(toRevision))
    setRefs(tree)
    setStatus(st)
    setSelected(0)
    setLive(true)
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    fetchHealth(ctrl.signal)
      .then(async (h) => {
        setHealth(h)
        setEngineError(null)
        const currentRepo = await fetchCurrent()
        if (currentRepo) setRepo(currentRepo)
        try {
          await refreshRepo()
          setRecents(await fetchRecents())
        } catch {
          setLive(false)
        }
      })
      .catch((err: unknown) => {
        setHealth(null)
        setEngineError(err instanceof Error ? err.message : "engine offline")
      })
    return () => ctrl.abort()
  }, [refreshRepo])

  async function onOpenFolder(path?: string) {
    const target = path ?? window.prompt("Open repository path")
    if (!target) return
    try {
      const info = await openRepo(target)
      setRepo(info)
      setEngineError(null)
      await refreshRepo()
      setRecents(await fetchRecents())
    } catch (err) {
      setEngineError(err instanceof Error ? err.message : "open failed")
    }
  }

  function onSelectTarget(sha: string) {
    const idx = rows.findIndex((r) => r.rev.id.startsWith(sha) || sha.startsWith(r.rev.id))
    if (idx >= 0) setSelected(idx)
  }

  async function onCommit(msg: string) {
    if (!msg.trim() || !status?.stagedCount) return
    await createCommit(msg.trim())
    setCommitOpen(false)
    await refreshRepo()
  }

  const branchNames = useMemo(() => (refs?.branches ?? []).map((b) => b.name), [refs])

  async function doCheckout(branch: string, force: boolean) {
    setStatus(await checkoutRef(branch, force))
    await refreshRepo()
  }
  async function doReset(mode: "soft" | "mixed" | "hard") {
    if (!resetRow) return
    setStatus(await resetBranch(resetRow.rev.id, mode))
    await refreshRepo()
  }
  async function doRebase() {
    if (!rebaseRow) return
    setStatus(await rebaseOnto(rebaseRow.rev.id))
    await refreshRepo()
  }

  async function doDeleteBranch(name: string) {
    if (!window.confirm(`Delete branch '${name}'?`)) return
    try {
      setRefs(await deleteBranch(name))
    } catch (e) {
      setEngineError(e instanceof Error ? e.message : "delete failed")
    }
  }
  async function doDeleteTag(name: string) {
    if (!window.confirm(`Delete tag '${name}'?`)) return
    try {
      setRefs(await deleteTag(name))
    } catch (e) {
      setEngineError(e instanceof Error ? e.message : "delete failed")
    }
  }
  async function doFetchRemote(name: string) {
    try {
      await fetchRemote(name)
      await refreshRepo()
    } catch (e) {
      setEngineError(e instanceof Error ? e.message : "fetch failed")
    }
  }
  function doOpenSubmodule(path: string) {
    if (!repo) return
    const sep = repo.root.endsWith("/") || repo.root.endsWith("\\") ? "" : "/"
    onOpenFolder(`${repo.root}${sep}${path}`)
  }

  return (
    <Box data-testid="browse-shell" sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "background.default" }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar variant="dense" data-testid="toolbar" sx={{ gap: 1, minHeight: 44, px: 1.5 }}>
          <Typography variant="subtitle1" sx={{ mr: 1, fontWeight: 700 }}>
            PowerGit
          </Typography>
          <Badge
            badgeContent={dirty || 0}
            color="primary"
            overlap="rectangular"
            sx={{ "& .MuiBadge-badge": { fontSize: 10, minWidth: 16, height: 16, px: 0.5 } }}
          >
            <Button variant="contained" size="small" data-testid="commit-button" onClick={() => setCommitOpen(true)}>
              Commit
            </Button>
          </Badge>
          <Button size="small" startIcon={<CloudDownloadOutlinedIcon />} disabled>
            Fetch
          </Button>
          <Button size="small" startIcon={<CallReceivedOutlinedIcon />} disabled>
            Pull
          </Button>
          <Button size="small" startIcon={<CloudUploadOutlinedIcon />} disabled>
            Push
          </Button>
          <Typography data-testid="engine-status" variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
            {health ? `${health.gitVersion} · engine ${health.engine}${live ? "" : " · synthetic"}` : (engineError ?? "engine offline")}
            {repo ? ` · ${repo.name} (${repo.branch})` : ""}
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
      <Box
        component="nav"
        data-testid="navrail"
        aria-label="Repositories"
        sx={{
          width: 64,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          py: 1.5,
          gap: 0.5,
          bgcolor: "background.paper",
          borderRight: 1,
          borderColor: "divider",
        }}
      >
        <Tooltip title={repo?.name ?? "PowerGit"} placement="right">
          <IconButton color="primary" sx={{ borderRadius: 2, bgcolor: "primary.main", color: "#fff", "&:hover": { bgcolor: "primary.dark" } }}>
            <AccountTreeOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Recent repositories" placement="right">
          <IconButton onClick={() => setRecentsOpen(true)} sx={{ borderRadius: 2 }}>
            <HistoryIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Settings" placement="right">
          <IconButton onClick={() => setSettingsOpen(true)} sx={{ borderRadius: 2 }} data-testid="settings-button">
            <SettingsOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Open repository" placement="right">
          <IconButton onClick={() => onOpenFolder()} sx={{ borderRadius: 2 }}>
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Box ref={contentRef} sx={{ flex: 1, minHeight: 0, p: 0.75, display: "flex", gap: 0.75 }}>
          {leftOpen ? (
            <RepoTree
              tree={refs}
              onSelectTarget={onSelectTarget}
              onCollapse={() => setLeftOpen(false)}
              onCheckoutRef={(name) => doCheckout(name, false).catch((e: unknown) => setEngineError(e instanceof Error ? e.message : "checkout failed"))}
              onDeleteBranch={doDeleteBranch}
              onDeleteTag={doDeleteTag}
              onFetchRemote={doFetchRemote}
              onConfigureRemote={(name) => setRemoteConfigFor(name)}
              onOpenSubmodule={doOpenSubmodule}
            />
          ) : (
            <Box
              data-testid="left-panel-collapsed"
              sx={{
                width: 36,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                py: 1,
                bgcolor: "background.paper",
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
              }}
            >
              <IconButton size="small" data-testid="left-panel-expand" onClick={() => setLeftOpen(true)} aria-label="Expand panel">
                <ChevronRightIcon />
              </IconButton>
              <Typography
                variant="caption"
                sx={{ writingMode: "vertical-rl", mt: 1, color: "text.secondary", letterSpacing: 1, userSelect: "none" }}
              >
                Repository
              </Typography>
            </Box>
          )}
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Box sx={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }} component="div">
              <Box sx={{ flex: 1, minHeight: 0, display: "flex", bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
                <RevisionGrid
                  rows={rows}
                  selected={selected}
                  onSelect={setSelected}
                  selectedAuthor={rows[selected]?.rev.author}
                  onRowContextMenu={(e, index) => {
                    e.preventDefault()
                    setCtxTarget({ x: e.clientX, y: e.clientY, row: rows[index] })
                  }}
                />
              </Box>
            </Box>
            <Box
              data-testid="panel-splitter"
              onPointerDown={onDividerDown}
              onPointerMove={onDividerMove}
              onPointerUp={onDividerUp}
              sx={{
                height: 6,
                flexShrink: 0,
                cursor: "row-resize",
                bgcolor: "divider",
                "&:hover": { bgcolor: "primary.main" },
              }}
            />
            <BottomPanel current={current} height={bottomHeight} />
          </Box>
        </Box>
      </Box>
      </Box>

      <CommitDialog
        open={commitOpen}
        status={status}
        onClose={() => setCommitOpen(false)}
        onStatus={setStatus}
        onCommit={async (msg) => {
          await onCommit(msg)
        }}
      />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <RecentsDialog open={recentsOpen} onClose={() => setRecentsOpen(false)} recents={recents} onPick={(p) => onOpenFolder(p)} />

      <RevisionContextMenu
        target={ctxTarget}
        branches={branchNames}
        onClose={() => setCtxTarget(null)}
        onCheckout={(b) => setCheckoutBranch(b)}
        onReset={() => {
          if (ctxTarget) setResetRow(ctxTarget.row)
        }}
        onRebase={() => {
          if (ctxTarget) setRebaseRow(ctxTarget.row)
        }}
      />
      {checkoutBranch !== null && (
        <CheckoutBranchDialog
          open
          branch={checkoutBranch}
          branchOptions={branchNames.length > 0 ? branchNames : [checkoutBranch]}
          dirtyCount={dirty}
          onClose={() => setCheckoutBranch(null)}
          onConfirm={doCheckout}
        />
      )}
      {resetRow && (
        <ResetBranchDialog
          open
          commit={resetRow.rev.id}
          subject={resetRow.rev.message}
          currentBranch={repo?.branch ?? ""}
          dirtyCount={dirty}
          onClose={() => setResetRow(null)}
          onConfirm={doReset}
        />
      )}
      {rebaseRow && (
        <RebaseDialog
          open
          ontoSha={rebaseRow.rev.id}
          ontoSubject={rebaseRow.rev.message}
          currentBranch={repo?.branch ?? ""}
          onClose={() => setRebaseRow(null)}
          onConfirm={doRebase}
        />
      )}
      {remoteConfigFor !== null && (
        <RemoteDialog open name={remoteConfigFor} onClose={() => setRemoteConfigFor(null)} />
      )}
    </Box>
  )
}

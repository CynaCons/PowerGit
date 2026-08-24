import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined"
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown"
import HistoryIcon from "@mui/icons-material/History"
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined"
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined"
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined"
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined"
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined"
import CallReceivedOutlinedIcon from "@mui/icons-material/CallReceivedOutlined"
import AppBar from "@mui/material/AppBar"
import Badge from "@mui/material/Badge"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"
import IconButton from "@mui/material/IconButton"
import LinearProgress from "@mui/material/LinearProgress"
import Toolbar from "@mui/material/Toolbar"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { BottomPanel } from "./components/BottomPanel"
import { CommitDialog } from "./components/CommitDialog"
import { CheckoutBranchDialog, CreateRefDialog, RebaseDialog, ResetBranchDialog, RevisionContextMenu, type ContextTarget } from "./components/GitOps"
import { RecentsDialog } from "./components/RecentsDialog"
import { RemoteDialog } from "./components/RemoteDialog"
import { RepoTree } from "./components/RepoTree"
import { RevisionGrid } from "./components/RevisionGrid"
import { SettingsDialog } from "./components/SettingsDialog"
import { StashDialog } from "./components/StashDialog"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import {
  checkoutRef,
  createBranch,
  createCommit,
  createTag,
  deleteBranch,
  deleteTag,
  fetchCommit,
  fetchCurrent,
  fetchHealth,
  fetchRecents,
  fetchRefs,
  fetchRevisions,
  fetchStatus,
  fetchStashes,
  openRepo,
  applyStash,
  dropStash,
  startFetch,
  startPull,
  startPush,
  waitJob,
  type StashInfo,
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
import type { GraphRow } from "./graph/types"
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
  // Synthetic rows are ONLY for the offline/demo case (engine unreachable).
  // While booting or loading a live repo the grid is empty — never fake data.
  const [offline, setOffline] = useState(false)
  const [revisions, setRevisions] = useState<Revision[]>([])
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
  const [stashOpen, setStashOpen] = useState(false)
  const [stashes, setStashes] = useState<StashInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [jobLabel, setJobLabel] = useState<string | null>(null)
  const [amend, setAmend] = useState(false)
  const [initialMsg, setInitialMsg] = useState<string | undefined>(undefined)
  const [createRef, setCreateRef] = useState<{ kind: "branch" | "tag"; sha: string; subject?: string } | null>(null)
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

  // Lane layout runs in a Web Worker; rows update when the latest request
  // finishes. The grid keeps showing the previous layout until then.
  const [liveGraphRows, setLiveGraphRows] = useState<GraphRow[]>([])
  const layoutWorker = useRef<Worker | null>(null)
  const layoutSeq = useRef(0)

  useEffect(() => {
    const worker = new Worker(new URL("./graph/layout.worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (e: MessageEvent<{ seq: number; rows: GraphRow[] }>) => {
      if (e.data.seq === layoutSeq.current) setLiveGraphRows(e.data.rows)
    }
    layoutWorker.current = worker
    return () => {
      worker.terminate()
      layoutWorker.current = null
    }
  }, [])

  useEffect(() => {
    if (offline) return
    const worker = layoutWorker.current
    if (!worker) return
    const seq = ++layoutSeq.current
    worker.postMessage({ seq, revisions })
  }, [offline, revisions])

  const syntheticRows = useMemo(
    () => layoutGraph(syntheticHistory(200).map((r) => ({ ...r, id: r.id.length >= 7 ? r.id : r.id.padEnd(7, "0") }))),
    [],
  )
  const rows = offline ? syntheticRows : liveGraphRows
  const current = rows[selected]
  const dirty = (status?.unstagedCount ?? 0) + (status?.stagedCount ?? 0)

  // Stale-while-revalidate, per-panel: every piece of repo data updates the
  // moment its own request lands. Nothing here blocks another panel, and a
  // slow revisions call never delays refs or status.
  const refreshRepo = useCallback(async () => {
    await Promise.allSettled([
      fetchRevisions(800)
        .then((rev) => {
          setRevisions(rev.map(toRevision))
          setLive(true)
        })
        .catch(() => undefined),
      fetchRefs().then(setRefs).catch(() => undefined),
      fetchStatus().then(setStatus).catch(() => undefined),
      fetchStashes().then(setStashes).catch(() => setStashes([])),
    ])
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    fetchHealth(ctrl.signal)
      .then(async (h) => {
        setHealth(h)
        setEngineError(null)
        setOffline(false)
        const currentRepo = await fetchCurrent()
        if (currentRepo) setRepo(currentRepo)
        try {
          await refreshRepo()
          setRecents(await fetchRecents())
        } catch {
          // One transient failure at boot (cold engine/git) shouldn't leave
          // the app dataless — retry once before giving up.
          await new Promise((r) => setTimeout(r, 1500))
          try {
            await refreshRepo()
            setRecents(await fetchRecents())
          } catch {
            setLive(false)
          }
        }
      })
      .catch(() => {
        // StrictMode remounts abort the first run; that is not "engine down".
        if (ctrl.signal.aborted) return
        setHealth(null)
        setEngineError(null)
        setOffline(true)
      })
    return () => ctrl.abort()
  }, [refreshRepo])

  async function onOpenFolder(path?: string) {
    let target = path
    if (!target) {
      if ("__TAURI_INTERNALS__" in window) {
        const { open } = await import("@tauri-apps/plugin-dialog")
        const picked = await open({ directory: true, multiple: false, title: "Open repository" })
        if (typeof picked !== "string") return
        target = picked
      } else {
        const answer = window.prompt("Open repository path")
        if (!answer) return
        target = answer
      }
    }
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
    if (!msg.trim() || (!status?.stagedCount && !amend)) return
    await createCommit(msg.trim(), amend)
    setCommitOpen(false)
    setAmend(false)
    setInitialMsg(undefined)
    await refreshRepo()
  }

  async function openAmend() {
    try {
      const d = await fetchCommit("HEAD")
      setInitialMsg(d.body ? `${d.subject}\n\n${d.body}` : d.subject)
    } catch {
      setInitialMsg(undefined)
    }
    setAmend(true)
    setCommitOpen(true)
  }

  async function doCreateRef(name: string) {
    if (!createRef) return
    const tree =
      createRef.kind === "branch"
        ? await createBranch(name, createRef.sha)
        : await createTag(name, createRef.sha)
    setRefs(tree)
  }

  const branchNames = useMemo(() => (refs?.branches ?? []).map((b) => b.name), [refs])
  const remoteNames = useMemo(
    () => [...new Set((refs?.remotes ?? []).map((r) => r.name.split("/")[0]).filter(Boolean))],
    [refs],
  )
  const defaultRemote = remoteNames[0] ?? "origin"

  async function runJob(label: string, start: () => Promise<{ id: string; kind: string }>) {
    if (busy) return
    setBusy(true)
    setJobLabel(label)
    try {
      const { id } = await start()
      const job = await waitJob(id)
      if (job.status === "failed") throw new Error(job.error ?? `${label} failed`)
      await refreshRepo()
      setEngineError(null)
    } catch (e) {
      setEngineError(e instanceof Error ? e.message : `${label} failed`)
    } finally {
      setBusy(false)
      setJobLabel(null)
    }
  }

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
    await runJob("Fetching", () => startFetch(name))
  }
  function doOpenSubmodule(path: string) {
    if (!repo) return
    const sep = repo.root.endsWith("/") || repo.root.endsWith("\\") ? "" : "/"
    onOpenFolder(`${repo.root}${sep}${path}`)
  }

  return (
    <Box data-testid="browse-shell" sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "background.default" }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar variant="dense" data-testid="toolbar" sx={{ gap: 0.75, minHeight: 44, px: 1.5, position: "relative" }}>
          {jobLabel !== null && (
            <Box
              data-testid="topbar-progress"
              sx={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                display: "flex",
                alignItems: "center",
                gap: 1,
                pointerEvents: "none",
              }}
            >
              <CircularProgress size={16} thickness={4} />
              <Typography variant="caption" color="text.secondary">
                {jobLabel}…
              </Typography>
            </Box>
          )}
          <Typography variant="subtitle1" sx={{ mr: 1, fontWeight: 700 }}>
            PowerGit
          </Typography>
          <Badge
            badgeContent={dirty || 0}
            color="primary"
            overlap="rectangular"
            sx={{ "& .MuiBadge-badge": { fontSize: 10, minWidth: 16, height: 16, px: 0.5 } }}
          >
            <SplitButton
              label="Commit"
              testid="commit-button"
              variant="contained"
              onMainClick={() => {
                setAmend(false)
                setInitialMsg(undefined)
                setCommitOpen(true)
              }}
            >
              <MenuItem data-testid="commit-amend" onClick={() => void openAmend()}>
                Amend last commit…
              </MenuItem>
            </SplitButton>
          </Badge>
          <SplitButton
            label={stashes.length > 0 ? `Stash (${stashes.length})` : "Stash"}
            icon={<Inventory2OutlinedIcon fontSize="small" />}
            testid="stash-button"
            disabled={!live}
            onMainClick={() => setStashOpen(true)}
          >
            <MenuItem data-testid="stash-manage" onClick={() => setStashOpen(true)}>
              Manage stashes…
            </MenuItem>
            <MenuItem
              data-testid="stash-apply-latest"
              disabled={stashes.length === 0}
              onClick={async () => {
                try {
                  setStatus(await applyStash("stash@{0}"))
                  await refreshRepo()
                } catch (err) {
                  setEngineError(err instanceof Error ? err.message : "apply failed")
                }
              }}
            >
              Apply stash@{"{0}"}
            </MenuItem>
            <MenuItem
              data-testid="stash-pop-latest"
              disabled={stashes.length === 0}
              onClick={async () => {
                try {
                  setStatus(await applyStash("stash@{0}", true))
                  await refreshRepo()
                } catch (err) {
                  setEngineError(err instanceof Error ? err.message : "pop failed")
                }
              }}
            >
              Pop stash@{"{0}"}
            </MenuItem>
            <MenuItem
              data-testid="stash-drop-latest"
              disabled={stashes.length === 0}
              onClick={async () => {
                if (!window.confirm("Drop stash@{0}? This cannot be undone.")) return
                try {
                  await dropStash("stash@{0}")
                  await refreshRepo()
                } catch (err) {
                  setEngineError(err instanceof Error ? err.message : "drop failed")
                }
              }}
            >
              Drop stash@{"{0}"}
            </MenuItem>
          </SplitButton>
          <SplitButton
            label="Fetch"
            icon={<CloudDownloadOutlinedIcon fontSize="small" />}
            testid="fetch-button"
            disabled={!live || busy}
            onMainClick={() => runJob("Fetching", () => startFetch(defaultRemote))}
          >
            {remoteNames.map((r) => (
              <MenuItem key={r} data-testid={`fetch-${r}`} onClick={() => runJob("Fetching", () => startFetch(r))}>
                {r}
              </MenuItem>
            ))}
            {remoteNames.length > 1 && (
              <MenuItem data-testid="fetch-all" onClick={() => runJob("Fetching all remotes", () => Promise.all(remoteNames.map((r) => startFetch(r))).then(([first]) => first))}>
                Fetch all remotes
              </MenuItem>
            )}
          </SplitButton>
          <SplitButton
            label="Pull"
            icon={<CallReceivedOutlinedIcon fontSize="small" />}
            testid="pull-button"
            disabled={!live || busy}
            onMainClick={() => runJob("Pulling", () => startPull(false))}
          >
            <MenuItem data-testid="pull-rebase" onClick={() => runJob("Pulling (rebase)", () => startPull(true))}>
              Pull (rebase onto upstream)
            </MenuItem>
          </SplitButton>
          <SplitButton
            label="Push"
            icon={<CloudUploadOutlinedIcon fontSize="small" />}
            testid="push-button"
            disabled={!live || busy}
            onMainClick={() => runJob("Pushing", () => startPush(false))}
          >
            <MenuItem data-testid="push-force-lease" onClick={() => runJob("Pushing (force with lease)", () => startPush(true))}>
              Push (force with lease)
            </MenuItem>
          </SplitButton>
            <Typography data-testid="engine-status" variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
              {health
                ? `${health.gitVersion} · engine ${health.engine}${live ? "" : " · no repository"}`
                : offline
                  ? "sample data · connect an engine for real repositories"
                  : "connecting…"}
              {repo ? ` · ${repo.name} (${repo.branch})` : ""}
            </Typography>
        </Toolbar>
        {!live && !offline && health !== null && (
          <LinearProgress data-testid="boot-progress" sx={{ height: 2 }} />
        )}
        {busy && jobLabel !== null && <LinearProgress sx={{ height: 2 }} />}
        </AppBar>
        {engineError && (
          <Typography variant="caption" color="error" sx={{ px: 2, py: 0.5, display: "block" }}>
            {engineError}
          </Typography>
        )}

      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
      <Box
        component="nav"
        data-testid="navrail"
        aria-label="Repositories"
        sx={{
          width: 48,
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
        <Tooltip title="Open repository…" placement="right">
          <IconButton data-testid="open-repo-button" onClick={() => onOpenFolder()} sx={{ borderRadius: 2 }} aria-label="Open repository">
            <CreateNewFolderOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Recent repositories" placement="right">
          <IconButton onClick={() => setRecentsOpen(true)} sx={{ borderRadius: 2 }} aria-label="Recent repositories">
            <HistoryIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Settings" placement="right">
          <IconButton onClick={() => setSettingsOpen(true)} sx={{ borderRadius: 2 }} data-testid="settings-button" aria-label="Settings">
            <SettingsOutlinedIcon fontSize="small" />
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
        amend={amend}
        initialMessage={initialMsg}
        onClose={() => {
          setCommitOpen(false)
          setAmend(false)
          setInitialMsg(undefined)
        }}
        onStatus={setStatus}
        onCommit={async (msg) => {
          await onCommit(msg)
        }}
      />

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <RecentsDialog open={recentsOpen} onClose={() => setRecentsOpen(false)} recents={recents} onPick={(p) => { if (p) onOpenFolder(p) }} />

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
        onCreateBranch={(sha) => setCreateRef({ kind: "branch", sha, subject: ctxTarget?.row.rev.message })}
        onCreateTag={(sha) => setCreateRef({ kind: "tag", sha, subject: ctxTarget?.row.rev.message })}
      />
      {createRef !== null && (
        <CreateRefDialog
          open
          kind={createRef.kind}
          commit={createRef.sha}
          subject={createRef.subject}
          existingNames={createRef.kind === "branch" ? branchNames : (refs?.tags ?? []).map((t) => t.name)}
          onClose={() => setCreateRef(null)}
          onConfirm={doCreateRef}
        />
      )}
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
      <StashDialog
        open={stashOpen}
        dirtyCount={dirty}
        onClose={() => {
          setStashOpen(false)
          refreshRepo()
        }}
        onStatus={setStatus}
      />
    </Box>
  )
}

// Git Extensions-style split button: main action on the left, dropdown caret
// for secondary actions. Material chrome only.
function SplitButton({
  label,
  icon,
  testid,
  variant = "text",
  disabled,
  onMainClick,
  children,
}: {
  label: string
  icon?: ReactNode
  testid: string
  variant?: "text" | "contained"
  disabled?: boolean
  onMainClick: () => void
  children?: ReactNode
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const shared = {
    size: "small" as const,
    disabled,
    sx: { minWidth: 0 },
  }
  return (
    <>
      <Box sx={{ display: "inline-flex", alignItems: "stretch" }}>
        <Button
          {...shared}
          variant={variant}
          data-testid={testid}
          startIcon={icon}
          onClick={onMainClick}
          sx={{ ...shared.sx, borderTopRightRadius: 0, borderBottomRightRadius: 0, pr: 1 }}
        >
          {label}
        </Button>
        <Button
          {...shared}
          variant={variant}
          data-testid={`${testid}-menu`}
          aria-label={`${label} options`}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{
            ...shared.sx,
            px: 0.25,
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            borderLeft: 1,
            borderColor: variant === "contained" ? "rgba(255,255,255,0.35)" : "divider",
            alignSelf: "stretch",
          }}
        >
          <ArrowDropDownIcon fontSize="small" />
        </Button>
      </Box>
      <Menu open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}>
        {children}
      </Menu>
    </>
  )
}

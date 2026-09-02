import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined"
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown"
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward"
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward"
import CallMergeIcon from "@mui/icons-material/CallMerge"
import CallSplitIcon from "@mui/icons-material/CallSplit"
import CheckIcon from "@mui/icons-material/Check"
import HistoryIcon from "@mui/icons-material/History"
import Inventory2Icon from "@mui/icons-material/Inventory2"
import LowPriorityIcon from "@mui/icons-material/LowPriority"
import RefreshIcon from "@mui/icons-material/Refresh"
import SellIcon from "@mui/icons-material/Sell"
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined"
import SwapHorizIcon from "@mui/icons-material/SwapHoriz"
import SyncIcon from "@mui/icons-material/Sync"
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined"
import AppBar from "@mui/material/AppBar"
import Badge from "@mui/material/Badge"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import ButtonGroup from "@mui/material/ButtonGroup"
import CircularProgress from "@mui/material/CircularProgress"
import Divider from "@mui/material/Divider"
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
  ENGINE_URL,
  checkoutRef,
  createBranch,
  createCommit,
  createTag,
  deleteBranch,
  deleteTag,
  describeThrown,
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
  type JobStarted,
  type StashInfo,
  rebaseOnto,
  resetBranch,
  type Health,
  type RefTree,
  type RepoInfo,
  type RepoStatus,
  type RevisionDto,
} from "./engine"
import { shortcutLabel, useHotkeyLayer, type CommandId } from "./hotkeys"
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

// History pages in from the engine: the first page renders fast, autofill
// keeps loading in the background up to EAGER_CEILING, and scrolling or
// jumping to a ref keeps loading up to HARD_CEILING.
const PAGE = 1000
const EAGER_CEILING = 10_000
const HARD_CEILING = 100_000

type RefreshScope = { revisions?: boolean; refs?: boolean; status?: boolean; stashes?: boolean }

export default function App() {
  // Synthetic rows are ONLY for the offline/demo case (engine unreachable).
  // While booting or loading a live repo the grid is empty — never fake data.
  const [offline, setOffline] = useState(false)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [historyComplete, setHistoryComplete] = useState(false)
  const [loadingTail, setLoadingTail] = useState(false)
  const [historyNote, setHistoryNote] = useState<string | null>(null)
  const [selectedSha, setSelectedSha] = useState<string | null>(null)
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
  const [bottomTab, setBottomTab] = useState(0)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const dragState = useRef<{ startY: number; startH: number } | null>(null)

  // History bookkeeping lives in refs so async loaders never read stale
  // state. All revision mutations flow through reloadHistory/extendHistory.
  const revisionsRef = useRef<Revision[]>([])
  const historyCompleteRef = useRef(false)
  const histGen = useRef(0)
  const revCount = useRef(0)
  const extendRun = useRef<Promise<void> | null>(null)

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

  // Lane layout runs in a Web Worker. History pages append to the worker's
  // existing layout; a refresh resets it. Replies older than the last reset
  // are dropped so a slow relayout can never clobber newer state.
  const [liveGraphRows, setLiveGraphRows] = useState<GraphRow[]>([])
  const layoutWorker = useRef<Worker | null>(null)
  const layoutSeq = useRef(0)
  const resetSeq = useRef(0)
  const lastSent = useRef<Revision[]>([])

  useEffect(() => {
    const worker = new Worker(new URL("./graph/layout.worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (e: MessageEvent<{ seq: number; reset: boolean; from: number; rows: GraphRow[] }>) => {
      const { seq, reset, from, rows } = e.data
      if (seq < resetSeq.current) return
      setLiveGraphRows((prev) => (reset ? rows : [...prev.slice(0, from), ...rows]))
    }
    layoutWorker.current = worker
    // A fresh worker has no layout state; force the next post to be a reset.
    lastSent.current = []
    return () => {
      worker.terminate()
      layoutWorker.current = null
    }
  }, [])

  useEffect(() => {
    if (offline) return
    const worker = layoutWorker.current
    if (!worker) return
    const prev = lastSent.current
    const isAppend =
      prev.length > 0 &&
      revisions.length > prev.length &&
      revisions[0] === prev[0] &&
      revisions[prev.length - 1] === prev[prev.length - 1]
    const seq = ++layoutSeq.current
    if (isAppend) {
      worker.postMessage({ seq, reset: false, revisions: revisions.slice(prev.length) })
    } else {
      resetSeq.current = seq
      worker.postMessage({ seq, reset: true, revisions })
    }
    lastSent.current = revisions
  }, [offline, revisions])

  const syntheticRows = useMemo(
    () => layoutGraph(syntheticHistory(200).map((r) => ({ ...r, id: r.id.length >= 7 ? r.id : r.id.padEnd(7, "0") }))),
    [],
  )
  const rows = offline ? syntheticRows : liveGraphRows

  // Selection is keyed by SHA so it survives refreshes and history appends;
  // the index is derived for the grid.
  const selected = useMemo(() => {
    if (rows.length === 0) return -1
    if (!selectedSha) return 0
    const i = rows.findIndex((r) => r.rev.id === selectedSha)
    return i >= 0 ? i : 0
  }, [rows, selectedSha])
  const current = selected >= 0 ? rows[selected] : undefined
  const dirty = (status?.unstagedCount ?? 0) + (status?.stagedCount ?? 0)

  // Loads further history pages up to targetCount. Single-flight: concurrent
  // callers (scroll, ref jump, autofill) share the in-flight run.
  const extendHistory = useCallback((targetCount: number): Promise<void> => {
    if (extendRun.current) return extendRun.current
    if (historyCompleteRef.current) return Promise.resolve()
    const gen = histGen.current
    const cap = Math.min(targetCount, HARD_CEILING)
    setLoadingTail(true)
    const run = (async () => {
      try {
        while (revCount.current < cap && histGen.current === gen && !historyCompleteRef.current) {
          const page = await fetchRevisions(PAGE, revCount.current)
          if (histGen.current !== gen) return
          if (page.length > 0) {
            revCount.current += page.length
            revisionsRef.current = [...revisionsRef.current, ...page.map(toRevision)]
            setRevisions(revisionsRef.current)
          }
          if (page.length < PAGE) {
            historyCompleteRef.current = true
            setHistoryComplete(true)
            return
          }
        }
      } catch {
        // Tail loading is best-effort; the next scroll or refresh retries.
      } finally {
        extendRun.current = null
        setLoadingTail(false)
      }
    })()
    extendRun.current = run
    return run
  }, [])

  // Refreshes history without shrinking what the user has loaded: refetch
  // page 0 and splice it onto the already-loaded tail where they overlap
  // (the common case after a commit). Anything odd falls back to a fresh
  // first page and lazy reloading.
  const reloadHistory = useCallback(async () => {
    const gen = ++histGen.current
    const page = await fetchRevisions(PAGE, 0)
    if (histGen.current !== gen) return
    const fresh = page.map(toRevision)
    let next = fresh
    let complete = page.length < PAGE
    if (!complete) {
      const old = revisionsRef.current
      const lastId = fresh[fresh.length - 1]?.id
      const k = lastId ? old.findIndex((r) => r.id === lastId) : -1
      if (k >= 0) {
        const seen = new Set(fresh.map((r) => r.id))
        next = [...fresh, ...old.slice(k + 1).filter((r) => !seen.has(r.id))]
        complete = historyCompleteRef.current
      }
    }
    revCount.current = next.length
    revisionsRef.current = next
    historyCompleteRef.current = complete
    setHistoryComplete(complete)
    setRevisions(next)
    setLive(true)
    if (!complete && next.length < EAGER_CEILING) void extendHistory(EAGER_CEILING)
  }, [extendHistory])

  // Per-panel refresh: callers name what an action could have changed so a
  // stage/commit never re-runs the full 4-call sweep. Every piece updates
  // the moment its own request lands (stale-while-revalidate).
  const lastRefreshAt = useRef(0)
  const refresh = useCallback(
    async (scope?: RefreshScope) => {
      lastRefreshAt.current = Date.now()
      const s = scope ?? { revisions: true, refs: true, status: true, stashes: true }
      const jobs: Promise<unknown>[] = []
      if (s.revisions) jobs.push(reloadHistory().catch(() => undefined))
      if (s.refs) jobs.push(fetchRefs().then(setRefs).catch(() => undefined))
      if (s.status) jobs.push(fetchStatus().then(setStatus).catch(() => undefined))
      if (s.stashes) jobs.push(fetchStashes().then(setStashes).catch(() => setStashes([])))
      await Promise.all(jobs)
      lastRefreshAt.current = Date.now()
    },
    [reloadHistory],
  )

  // Live refresh: the engine streams a change version whenever .git metadata
  // moves (HEAD, refs, index) — external git activity shows up on its own.
  // Debounced so an event burst (e.g. a rebase) refreshes once, and muted
  // right after our own refreshes so in-app actions don't refresh twice.
  useEffect(() => {
    if (offline || !live) return
    const source = new EventSource(`${ENGINE_URL}/events`)
    let timer: number | undefined
    let last: string | null = null
    source.onmessage = (e) => {
      if (last === e.data) return
      const isFirst = last === null
      last = e.data
      if (isFirst) return // initial snapshot, nothing changed
      if (Date.now() - lastRefreshAt.current < 2000) return // our own action
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void refresh(), 400)
    }
    return () => {
      window.clearTimeout(timer)
      source.close()
    }
  }, [offline, live, refresh])

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
          await refresh()
          setRecents(await fetchRecents())
        } catch {
          // One transient failure at boot (cold engine/git) shouldn't leave
          // the app dataless — retry once before giving up.
          await new Promise((r) => setTimeout(r, 1500))
          try {
            await refresh()
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
  }, [refresh])

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
      // A different repo: drop the loaded history instead of splicing.
      histGen.current += 1
      revCount.current = 0
      revisionsRef.current = []
      historyCompleteRef.current = false
      setHistoryComplete(false)
      setSelectedSha(null)
      await refresh()
      setRecents(await fetchRecents())
    } catch (err) {
      setEngineError(err instanceof Error ? err.message : "open failed")
    }
  }

  // Owner requirement: with thousands of branches most tips are NOT in the
  // loaded history — jumping to a ref keeps loading pages until its commit
  // appears (or the ceiling is hit) instead of silently doing nothing.
  const jumpToRef = useCallback(
    async (sha: string) => {
      const find = () => revisionsRef.current.find((r) => r.id.startsWith(sha) || sha.startsWith(r.id))
      let hit = find()
      const gen = histGen.current
      while (!hit && !historyCompleteRef.current && revCount.current < HARD_CEILING && histGen.current === gen) {
        const before = revCount.current
        setHistoryNote(`Loading history… ${before.toLocaleString()} commits`)
        await extendHistory(before + 5 * PAGE)
        hit = find()
        if (revCount.current === before) break // fetch failed; don't spin
      }
      setHistoryNote(null)
      if (hit) {
        setSelectedSha(hit.id)
      } else {
        setEngineError(`Commit ${sha.slice(0, 10)} is not within the first ${revCount.current.toLocaleString()} commits`)
      }
    },
    [extendHistory],
  )

  async function onCommit(msg: string) {
    if (!msg.trim() || (!status?.stagedCount && !amend)) return
    await createCommit(msg.trim(), amend)
    setCommitOpen(false)
    setAmend(false)
    setInitialMsg(undefined)
    await refresh({ revisions: true, refs: true, status: true })
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
    await refresh({ revisions: true })
  }

  const branchNames = useMemo(() => (refs?.branches ?? []).map((b) => b.name), [refs])
  const remoteNames = useMemo(
    () => [...new Set((refs?.remotes ?? []).map((r) => r.name.split("/")[0]).filter(Boolean))],
    [refs],
  )
  const defaultRemote = remoteNames[0] ?? "origin"

  // Shows the topbar progress indicator around any mutating engine call —
  // sync ops (checkout, reset, rebase, stash) give the same feedback as jobs.
  async function withBusy(label: string, fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setJobLabel(label)
    try {
      await fn()
      setEngineError(null)
    } catch (e) {
      // Prefix the operation name: a bare browser/DOMException message (e.g.
      // WebKit's "The string did not match the expected pattern") is
      // otherwise impossible to trace back to what the user clicked.
      // `describeThrown` (engine.ts) reads `.message` defensively since
      // DOMException does not reliably satisfy `instanceof Error`.
      setEngineError(`${label}: ${describeThrown(e)}`)
    } finally {
      setBusy(false)
      setJobLabel(null)
    }
  }

  // The engine runs one network job at a time (single-flight guard), so a
  // multi-remote fetch must run sequentially, never Promise.all.
  async function runJobSequence(label: string, starts: Array<() => Promise<JobStarted>>) {
    await withBusy(label, async () => {
      for (const start of starts) {
        const { id } = await start()
        const job = await waitJob(id)
        if (job.status === "failed") throw new Error(job.error ?? `${label} failed`)
      }
      await refresh()
    })
  }

  async function runJob(label: string, start: () => Promise<JobStarted>) {
    await runJobSequence(label, [start])
  }

  async function doCheckout(branch: string, force: boolean) {
    await withBusy("Checking out", async () => {
      setStatus(await checkoutRef(branch, force))
      await refresh({ revisions: true, refs: true, status: true })
    })
  }
  async function doReset(mode: "soft" | "mixed" | "hard") {
    if (!resetRow) return
    await withBusy("Resetting", async () => {
      setStatus(await resetBranch(resetRow.rev.id, mode))
      await refresh({ revisions: true, refs: true, status: true })
    })
  }
  async function doRebase() {
    if (!rebaseRow) return
    await withBusy("Rebasing", async () => {
      setStatus(await rebaseOnto(rebaseRow.rev.id))
      await refresh({ revisions: true, refs: true, status: true })
    })
  }

  async function doDeleteBranch(name: string) {
    if (!window.confirm(`Delete branch '${name}'?`)) return
    try {
      setRefs(await deleteBranch(name))
      await refresh({ revisions: true })
    } catch (e) {
      setEngineError(`Delete branch failed: ${describeThrown(e)}`)
    }
  }
  async function doDeleteTag(name: string) {
    if (!window.confirm(`Delete tag '${name}'?`)) return
    try {
      setRefs(await deleteTag(name))
      await refresh({ revisions: true })
    } catch (e) {
      setEngineError(`Delete tag failed: ${describeThrown(e)}`)
    }
  }
  async function doFetchRemote(name: string) {
    await runJob("Fetching", () => startFetch(name))
  }
  // Shared by the toolbar buttons and their hotkeys so both entry points
  // always agree on behaviour.
  function openCreateBranch() {
    if (!current) return
    setCreateRef({ kind: "branch", sha: current.rev.id, subject: current.rev.message })
  }
  function openCreateTag() {
    if (!current) return
    setCreateRef({ kind: "tag", sha: current.rev.id, subject: current.rev.message })
  }
  function openCheckoutBranch() {
    const name = repo?.branch ?? branchNames[0]
    if (name) setCheckoutBranch(name)
  }
  function openRebase() {
    if (current) setRebaseRow(current)
  }
  async function doDeleteBranchPrompt() {
    const hint = branchNames.length > 0 ? `Delete which branch?\n(${branchNames.join(", ")})` : "Delete which branch?"
    const target = window.prompt(hint)
    if (target?.trim()) await doDeleteBranch(target.trim())
  }
  function doOpenSubmodule(path: string) {
    if (!repo) return
    const sep = repo.root.endsWith("/") || repo.root.endsWith("\\") ? "" : "/"
    onOpenFolder(`${repo.root}${sep}${path}`)
  }

  const onNearEnd = useCallback(() => {
    if (offline || !live || historyComplete) return
    void extendHistory(revCount.current + PAGE)
  }, [offline, live, historyComplete, extendHistory])

  const progressLabel = jobLabel !== null ? `${jobLabel}…` : historyNote

  const blockingDialog =
    settingsOpen ||
    recentsOpen ||
    stashOpen ||
    createRef !== null ||
    checkoutBranch !== null ||
    resetRow !== null ||
    rebaseRow !== null ||
    remoteConfigFor !== null

  useHotkeyLayer(
    "browse",
    {
      "browse.commit": () => {
        setAmend(false)
        setInitialMsg(undefined)
        setCommitOpen(true)
      },
      "browse.openRepo": () => void onOpenFolder(),
      "browse.openSettings": () => setSettingsOpen(true),
      "browse.createBranch": openCreateBranch,
      "browse.createTag": openCreateTag,
      "browse.checkoutBranch": openCheckoutBranch,
      "browse.rebase": openRebase,
      "browse.pull": () => {
        if (live && !busy) void runJob("Pulling", () => startPull(false))
      },
      "browse.push": () => {
        if (live && !busy) void runJob("Pushing", () => startPush(false))
      },
      "browse.quickFetch": () => {
        if (live && !busy) void runJob("Fetching", () => startFetch(defaultRemote))
      },
      "browse.quickPull": () => {
        if (live && !busy) void runJob("Pulling", () => startPull(false))
      },
      "browse.quickPush": () => {
        if (live && !busy) void runJob("Pushing", () => startPush(false))
      },
      "browse.quickPullOrFetch": () => {
        if (live && !busy) void runJob("Pulling", () => startPull(false))
      },
      "browse.stash": () => {
        if (live) setStashOpen(true)
      },
      "browse.stashPop": () => {
        if (!live || stashes.length === 0) return
        void withBusy("Popping stash", async () => {
          setStatus(await applyStash("stash@{0}", true))
          await refresh({ revisions: true, status: true, stashes: true })
        })
      },
      "browse.toggleLeftPanel": () => setLeftOpen((o) => !o),
      "browse.focusLeftPanel": () => {
        if (!leftOpen) setLeftOpen(true)
        requestAnimationFrame(() => {
          ;(document.querySelector('[data-testid="tree-filter"]') as HTMLElement | null)?.focus()
        })
      },
      "browse.focusRevisionGrid": () => {
        ;(document.querySelector('[data-testid="grid-body"]') as HTMLElement | null)?.focus()
      },
      "browse.focusCommitInfo": () => setBottomTab(0),
      "browse.focusDiff": () => setBottomTab(1),
      "browse.focusFileTree": () => setBottomTab(2),
      "browse.focusNextTab": () => setBottomTab((t) => (t + 1) % 3),
      "browse.focusPrevTab": () => setBottomTab((t) => (t + 2) % 3),
      "browse.refresh": () => {
        if (live) void refresh()
      },
    } satisfies Partial<Record<CommandId, () => void>>,
    !commitOpen && !blockingDialog,
  )

  return (
    <Box data-testid="browse-shell" sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "background.default" }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar variant="dense" data-testid="toolbar" sx={{ gap: 0.5, minHeight: 30, py: 0.25, px: 1, position: "relative" }}>
          {progressLabel !== null && (
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
                {progressLabel}
              </Typography>
            </Box>
          )}
          <Typography variant="subtitle1" sx={{ mr: 1, fontWeight: 700 }}>
            PowerGit
          </Typography>
          <ToolbarButton
            label="Refresh"
            icon={<RefreshIcon fontSize="small" />}
            testid="refresh-button"
            disabled={!live}
            shortcut={shortcutLabel("browse.refresh")}
            onClick={() => void refresh()}
          />
          <Divider orientation="vertical" flexItem sx={{ height: 18, alignSelf: "center", my: 0 }} />
          <Badge
            badgeContent={dirty || 0}
            color="primary"
            overlap="rectangular"
            sx={{ "& .MuiBadge-badge": { fontSize: 10, minWidth: 16, height: 16, px: 0.5 } }}
          >
            <SplitButton
              label="Commit"
              icon={<CheckIcon fontSize="small" />}
              testid="commit-button"
              variant="contained"
              shortcut={shortcutLabel("browse.commit")}
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
            icon={<Inventory2Icon fontSize="small" />}
            testid="stash-button"
            disabled={!live}
            shortcut={shortcutLabel("browse.stash")}
            onMainClick={() => setStashOpen(true)}
          >
            <MenuItem data-testid="stash-manage" onClick={() => setStashOpen(true)}>
              Manage stashes…
            </MenuItem>
            <MenuItem
              data-testid="stash-apply-latest"
              disabled={stashes.length === 0}
              onClick={() =>
                withBusy("Applying stash", async () => {
                  setStatus(await applyStash("stash@{0}"))
                  await refresh({ revisions: true, status: true, stashes: true })
                })
              }
            >
              Apply stash@{"{0}"}
            </MenuItem>
            <MenuItem
              data-testid="stash-pop-latest"
              disabled={stashes.length === 0}
              onClick={() =>
                withBusy("Popping stash", async () => {
                  setStatus(await applyStash("stash@{0}", true))
                  await refresh({ revisions: true, status: true, stashes: true })
                })
              }
            >
              Pop stash@{"{0}"} ({shortcutLabel("browse.stashPop")})
            </MenuItem>
            <MenuItem
              data-testid="stash-drop-latest"
              disabled={stashes.length === 0}
              onClick={() => {
                if (!window.confirm("Drop stash@{0}? This cannot be undone.")) return
                void withBusy("Dropping stash", async () => {
                  await dropStash("stash@{0}")
                  await refresh({ revisions: true, status: true, stashes: true })
                })
              }}
            >
              Drop stash@{"{0}"}
            </MenuItem>
          </SplitButton>
          <Divider orientation="vertical" flexItem sx={{ height: 18, alignSelf: "center", my: 0 }} />
          <SplitButton
            label="Pull"
            icon={<ArrowDownwardIcon fontSize="small" />}
            testid="pull-button"
            disabled={!live || busy}
            shortcut={shortcutLabel("browse.pull")}
            onMainClick={() => runJob("Pulling", () => startPull(false))}
          >
            <MenuItem data-testid="pull-rebase" onClick={() => runJob("Pulling (rebase)", () => startPull(true))}>
              Pull (rebase onto upstream)
            </MenuItem>
          </SplitButton>
          <SplitButton
            label="Push"
            icon={<ArrowUpwardIcon fontSize="small" />}
            testid="push-button"
            disabled={!live || busy}
            shortcut={shortcutLabel("browse.push")}
            onMainClick={() => runJob("Pushing", () => startPush(false))}
          >
            <MenuItem data-testid="push-force-lease" onClick={() => runJob("Pushing (force with lease)", () => startPush(true))}>
              Push (force with lease)
            </MenuItem>
          </SplitButton>
          <SplitButton
            label="Fetch"
            icon={<SyncIcon fontSize="small" />}
            testid="fetch-button"
            disabled={!live || busy}
            shortcut={shortcutLabel("browse.quickFetch")}
            onMainClick={() => runJob("Fetching", () => startFetch(defaultRemote))}
          >
            {remoteNames.map((r) => (
              <MenuItem key={r} data-testid={`fetch-${r}`} onClick={() => runJob("Fetching", () => startFetch(r))}>
                {r}
              </MenuItem>
            ))}
            {remoteNames.length > 1 && (
              <MenuItem
                data-testid="fetch-all"
                onClick={() =>
                  runJobSequence(
                    "Fetching all remotes",
                    remoteNames.map((r) => () => startFetch(r)),
                  )
                }
              >
                Fetch all remotes
              </MenuItem>
            )}
          </SplitButton>
          <Divider orientation="vertical" flexItem sx={{ height: 18, alignSelf: "center", my: 0 }} />
          <SplitButton
            label="Branch"
            icon={<CallSplitIcon fontSize="small" />}
            testid="branch-button"
            disabled={!live || !current}
            shortcut={shortcutLabel("browse.createBranch")}
            onMainClick={openCreateBranch}
          >
            <MenuItem data-testid="branch-delete" onClick={() => void doDeleteBranchPrompt()}>
              Delete branch…
            </MenuItem>
          </SplitButton>
          <ToolbarButton
            label="Checkout"
            icon={<SwapHorizIcon fontSize="small" />}
            testid="checkout-button"
            disabled={!live}
            shortcut={shortcutLabel("browse.checkoutBranch")}
            onClick={openCheckoutBranch}
          />
          <Tooltip title="Merge branches (coming soon)">
            <span>
              <ToolbarButton
                label="Merge"
                icon={<CallMergeIcon fontSize="small" />}
                testid="merge-button"
                disabled
                onClick={() => {}}
              />
            </span>
          </Tooltip>
          <ToolbarButton
            label="Rebase"
            icon={<LowPriorityIcon fontSize="small" />}
            testid="rebase-button"
            disabled={!live || !current}
            shortcut={shortcutLabel("browse.rebase")}
            onClick={openRebase}
          />
          <ToolbarButton
            label="Tag"
            icon={<SellIcon fontSize="small" />}
            testid="tag-button"
            disabled={!live || !current}
            shortcut={shortcutLabel("browse.createTag")}
            onClick={openCreateTag}
          />
            <Typography
              data-testid="engine-status"
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ ml: "auto", minWidth: 0 }}
            >
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
        <Tooltip title={`Open repository… (${shortcutLabel("browse.openRepo")})`} placement="right">
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
        <Tooltip title={`Settings (${shortcutLabel("browse.openSettings")})`} placement="right">
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
              onSelectTarget={(sha) => void jumpToRef(sha)}
              onCollapse={() => setLeftOpen(false)}
              onCheckoutRef={(name) => void doCheckout(name, false)}
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
                  onSelect={(i) => setSelectedSha(rows[i]?.rev.id ?? null)}
                  selectedAuthor={current?.rev.author}
                  loadingTail={loadingTail}
                  onNearEnd={onNearEnd}
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
            <BottomPanel current={current} height={bottomHeight} tab={bottomTab} onTab={setBottomTab} />
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
          void refresh({ revisions: true, status: true, stashes: true })
        }}
        onStatus={setStatus}
      />
    </Box>
  )
}

// Git Extensions density for the whole command bar: ~26px buttons keep the
// toolbar row to ~28-30px total instead of MUI's default ~31-33px "small"
// button metrics stacking up with the toolbar's own padding. Icons keep
// their fontSize="small" prop at call sites (untouched) and are rescaled to
// 18px here via the MuiSvgIcon-root descendant selector, so every toolbar
// icon shrinks uniformly without editing each call site.
const TOOLBAR_BUTTON_SX = {
  height: 26,
  minWidth: 0,
  px: 1,
  py: 0,
  fontSize: 12,
  "& .MuiSvgIcon-root": { fontSize: 18 },
} as const

// The split-button dropdown caret is its own narrow segment, not a second
// full-width button. MuiButtonGroup applies `.MuiButtonGroup-grouped { min-
// width: 40px }` to every grouped child via a two-class descendant selector,
// which outranks a single-class sx utility rule on specificity alone (not
// source order) — !important is the narrow, deliberate override for just
// this instance.
const TOOLBAR_CARET_SX = {
  ...TOOLBAR_BUTTON_SX,
  px: 0,
  minWidth: "20px !important",
  width: "20px !important",
} as const

// Git Extensions-style split button: main action on the left, dropdown caret
// for secondary actions. A MUI ButtonGroup keeps both halves in one bordered
// group with a single shared divider (no gap), so the caret is unambiguously
// part of the button to its left rather than floating between two buttons.
function SplitButton({
  label,
  icon,
  testid,
  variant = "outlined",
  disabled,
  shortcut,
  onMainClick,
  children,
}: {
  label: string
  icon?: ReactNode
  testid: string
  variant?: "outlined" | "contained"
  disabled?: boolean
  shortcut?: string
  onMainClick: () => void
  children?: ReactNode
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <ButtonGroup size="small" variant={variant} disabled={disabled}>
        <Button
          data-testid={testid}
          startIcon={icon}
          title={shortcut ? `${label} (${shortcut})` : undefined}
          onClick={onMainClick}
          sx={TOOLBAR_BUTTON_SX}
        >
          {label}
        </Button>
        <Button
          data-testid={`${testid}-menu`}
          aria-label={`${label} options`}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={TOOLBAR_CARET_SX}
        >
          <ArrowDropDownIcon fontSize="small" />
        </Button>
      </ButtonGroup>
      <Menu open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}>
        {children}
      </Menu>
    </>
  )
}

// Standalone Git Extensions-style toolbar button: icon + short label, no
// caret — reserved for actions with no attached menu (see SplitButton).
function ToolbarButton({
  label,
  icon,
  testid,
  disabled,
  shortcut,
  onClick,
}: {
  label: string
  icon: ReactNode
  testid: string
  disabled?: boolean
  shortcut?: string
  onClick: () => void
}) {
  return (
    <Button
      size="small"
      variant="outlined"
      data-testid={testid}
      startIcon={icon}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : undefined}
      onClick={onClick}
      sx={TOOLBAR_BUTTON_SX}
    >
      {label}
    </Button>
  )
}

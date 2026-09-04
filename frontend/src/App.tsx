import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined"
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown"
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward"
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward"
import CallMergeIcon from "@mui/icons-material/CallMerge"
import CallSplitIcon from "@mui/icons-material/CallSplit"
import CheckIcon from "@mui/icons-material/Check"
import CloseIcon from "@mui/icons-material/Close"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import HistoryIcon from "@mui/icons-material/History"
import Inventory2Icon from "@mui/icons-material/Inventory2"
import LowPriorityIcon from "@mui/icons-material/LowPriority"
import MoreHorizIcon from "@mui/icons-material/MoreHoriz"
import RefreshIcon from "@mui/icons-material/Refresh"
import SellIcon from "@mui/icons-material/Sell"
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined"
import SwapHorizIcon from "@mui/icons-material/SwapHoriz"
import SyncIcon from "@mui/icons-material/Sync"
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined"
import Alert from "@mui/material/Alert"
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
  engineEventsUrl,
  changeKindOf,
  type ChangeKind,
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
import { createLayouter, layoutGraph, type GraphLayouter } from "./graph/layout"
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

// navigator.clipboard requires a secure context and can be missing/blocked
// under tauri:// (no https, no permission prompt shown yet); fall back to
// the classic hidden-textarea + execCommand trick, which works from any
// focused document regardless of origin.
async function copyToClipboard(text: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard API unavailable")
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // fall through to the textarea fallback below
  }
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  try {
    document.execCommand("copy")
  } finally {
    document.body.removeChild(textarea)
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
  type LayoutRequest = { seq: number; reset: boolean; revisions: Revision[] }
  type LayoutReply = { seq: number; reset: boolean; from: number; rows: GraphRow[] }
  const layoutWorker = useRef<Worker | null>(null)
  const layoutSeq = useRef(0)
  const resetSeq = useRef(0)
  const lastSent = useRef<Revision[]>([])

  // Where layout requests go: the worker, or an in-thread layouter once the
  // worker has failed (module workers over the tauri:// custom scheme have
  // regressed on some WebKitGTK builds; without this the grid stays empty).
  const layoutPost = useRef<((m: LayoutRequest) => void) | null>(null)

  useEffect(() => {
    const handle = ({ seq, reset, from, rows }: LayoutReply) => {
      if (seq < resetSeq.current) return
      setLiveGraphRows((prev) => (reset ? rows : [...prev.slice(0, from), ...rows]))
    }
    const worker = new Worker(new URL("./graph/layout.worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (e: MessageEvent<LayoutReply>) => handle(e.data)
    layoutPost.current = (m) => worker.postMessage(m)
    worker.onerror = (ev) => {
      console.error("[powergit] layout worker failed, laying out on the main thread:", ev.message)
      worker.terminate()
      let inThread: GraphLayouter = createLayouter()
      layoutPost.current = (m) => {
        if (m.reset) inThread = createLayouter()
        const from = inThread.rowCount()
        handle({ seq: m.seq, reset: m.reset, from, rows: inThread.append(m.revisions) })
      }
      // Whatever the worker swallowed is gone; replay the last full set.
      const seq = ++layoutSeq.current
      resetSeq.current = seq
      layoutPost.current({ seq, reset: true, revisions: lastSent.current })
    }
    layoutWorker.current = worker
    // A fresh worker has no layout state; force the next post to be a reset.
    lastSent.current = []
    return () => {
      worker.terminate()
      layoutWorker.current = null
      layoutPost.current = null
    }
  }, [])

  useEffect(() => {
    if (offline) return
    const post = layoutPost.current
    if (!post) return
    const prev = lastSent.current
    const isAppend =
      prev.length > 0 &&
      revisions.length > prev.length &&
      revisions[0] === prev[0] &&
      revisions[prev.length - 1] === prev[prev.length - 1]
    const seq = ++layoutSeq.current
    if (isAppend) {
      post({ seq, reset: false, revisions: revisions.slice(prev.length) })
    } else {
      resetSeq.current = seq
      post({ seq, reset: true, revisions })
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
  // The low bits of the version classify the change (see engine.ts
  // `changeKindOf`): a status-only burst (e.g. repeated `git status` index
  // touches) only re-fetches status instead of the full revisions+refs+
  // status sweep. "refs" is the superset for the rare mixed burst, so it
  // always wins over an earlier "status" seen in the same debounce window.
  useEffect(() => {
    if (offline || !live) return
    // The URL carries the engine token (EventSource cannot send headers) and
    // is only known once the Tauri port/token handshake resolved.
    let source: EventSource | null = null
    let cancelled = false
    let timer: number | undefined
    let last: string | null = null
    let pendingKind: ChangeKind = "none"
    void engineEventsUrl().catch(() => null).then((url) => {
      if (cancelled || !url) return // no repository open yet: nothing to watch
      source = new EventSource(url)
      source.onmessage = (e) => {
        if (last === e.data) return
        const isFirst = last === null
        last = e.data
        if (isFirst) return // initial snapshot, nothing changed
        if (Date.now() - lastRefreshAt.current < 2000) return // our own action
        const kind = changeKindOf(Number(e.data))
        if (pendingKind !== "refs") pendingKind = kind
        window.clearTimeout(timer)
        timer = window.setTimeout(() => {
          const scope: RefreshScope = pendingKind === "status" ? { status: true } : { revisions: true, refs: true, status: true }
          pendingKind = "none"
          void refresh(scope)
        }, 400)
      }
    })
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      source?.close()
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

  // Returns focus to the grid so arrow keys work immediately, after a dialog
  // closes or a busy action finishes. The double rAF runs after MUI's own
  // FocusTrap restores focus to whatever was focused before the dialog
  // opened: that restore fires from an effect cleanup tied to the dialog's
  // `open` prop, not to the exit transition, so a same-tick focus() call
  // here could otherwise be undone a moment later by MUI's own restore.
  function focusGrid() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ;(document.querySelector('[data-testid="grid-body"]') as HTMLElement | null)?.focus()
      })
    })
  }

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
      focusGrid()
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
        focusGrid()
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

  // Command-bar overflow, the standard desktop/Fluent pattern: labels drop
  // to icons as the window narrows, then the secondary group collapses into
  // a single "More" menu. Driven by the toolbar's own measured width (not a
  // viewport media query) so it also reacts to the app being embedded or a
  // scrollbar appearing, and so nothing ever wraps or overflows off-screen.
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const [toolbarTier, setToolbarTier] = useState<"full" | "compact" | "overflow">("full")
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const el = toolbarRef.current
    if (!el) return
    const apply = (w: number) => setToolbarTier(w >= 1080 ? "full" : w >= 790 ? "compact" : "overflow")
    apply(el.getBoundingClientRect().width)
    // ResizeObserver is unavailable in no-DOM test shims; width then just
    // stays at whatever the first measurement produced.
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver((entries) => apply(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const iconsOnly = toolbarTier !== "full"
  const overflowed = toolbarTier === "overflow"

  // Below the overflow width there is not enough room for both the ref panel
  // (232px fixed) and a readable grid: the Author/Date/SHA columns get pushed
  // off the right edge. Collapse the panel automatically, and restore it when
  // the window grows again — but only if we were the ones who closed it, so a
  // deliberate Ctrl+B stays honoured.
  const autoCollapsed = useRef(false)
  useEffect(() => {
    if (overflowed) {
      setLeftOpen((open) => {
        if (open) autoCollapsed.current = true
        return false
      })
    } else if (autoCollapsed.current) {
      autoCollapsed.current = false
      setLeftOpen(true)
    }
  }, [overflowed])

  // PowerGit is a desktop app: the WebView's own context menu must never
  // appear. Without this, right-clicking anywhere that is not a grid row —
  // including the MUI Menu's own backdrop, which is what the pointer lands
  // on for the *second* right-click while a menu is open — showed the
  // browser menu instead of ours. Capture phase, so it runs before React's
  // delegated handlers; no stopPropagation, so row handlers still fire.
  // Editable fields keep their native menu (cut/copy/paste).
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest("input, textarea, [contenteditable='true']")) return
      e.preventDefault()
    }
    document.addEventListener("contextmenu", onContextMenu, true)
    return () => document.removeEventListener("contextmenu", onContextMenu, true)
  }, [])

  return (
    <Box data-testid="browse-shell" sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "background.default" }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar ref={toolbarRef} variant="dense" data-testid="toolbar" data-tier={toolbarTier} sx={{ gap: 0.5, minHeight: 32, py: 0.25, px: 1, flexWrap: "nowrap", overflow: "hidden" }}>
          <Typography variant="subtitle1" sx={{ mr: 1, fontWeight: 700 }}>
            PowerGit
          </Typography>
          <ToolbarButton
            label="Refresh"
            icon={<RefreshIcon fontSize="small" />}
            testid="refresh-button"
            compact={iconsOnly}
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
            compact={iconsOnly}
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
            compact={iconsOnly}
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
            compact={iconsOnly}
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
            compact={iconsOnly}
            disabled={!live || busy}
            shortcut={shortcutLabel("browse.quickFetch")}
            onMainClick={() => runJob("Fetching", () => startFetch(defaultRemote))}
          >
            {/* "Fetch all" is a first-class Git Extensions action, so it is
                always listed (disabled with no remotes) rather than appearing
                only once a second remote exists. */}
            <MenuItem
              data-testid="fetch-all"
              disabled={remoteNames.length === 0}
              onClick={() =>
                runJobSequence(
                  "Fetching all remotes",
                  remoteNames.map((r) => () => startFetch(r)),
                )
              }
            >
              Fetch all remotes
            </MenuItem>
            <Divider />
            {remoteNames.map((r) => (
              <MenuItem key={r} data-testid={`fetch-${r}`} onClick={() => runJob("Fetching", () => startFetch(r))}>
                {`Fetch ${r}`}
              </MenuItem>
            ))}
          </SplitButton>
          <Divider orientation="vertical" flexItem sx={{ height: 18, alignSelf: "center", my: 0 }} />
          {/* Branch/Checkout/Merge/Rebase/Tag are the secondary group: they
              show as buttons while there is room and collapse wholesale into
              the "More" menu below that width, rather than being clipped. */}
          {!overflowed && (
            <>
              <SplitButton
                label="Branch"
                icon={<CallSplitIcon fontSize="small" />}
                testid="branch-button"
                disabled={!live || !current}
                shortcut={shortcutLabel("browse.createBranch")}
                compact={iconsOnly}
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
                compact={iconsOnly}
                onClick={openCheckoutBranch}
              />
              <Tooltip title="Merge branches (coming soon)">
                <span>
                  <ToolbarButton
                    label="Merge"
                    icon={<CallMergeIcon fontSize="small" />}
                    testid="merge-button"
                    disabled
                    compact={iconsOnly}
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
                compact={iconsOnly}
                onClick={openRebase}
              />
              <ToolbarButton
                label="Tag"
                icon={<SellIcon fontSize="small" />}
                testid="tag-button"
                disabled={!live || !current}
                shortcut={shortcutLabel("browse.createTag")}
                compact={iconsOnly}
                onClick={openCreateTag}
              />
            </>
          )}
          {overflowed && (
            <>
              <ToolbarButton
                label="More actions"
                icon={<MoreHorizIcon fontSize="small" />}
                testid="toolbar-more"
                compact
                onClick={(e) => setMoreAnchor(e.currentTarget)}
              />
              <Menu open={moreAnchor !== null} anchorEl={moreAnchor} onClose={() => setMoreAnchor(null)}>
                <MenuItem
                  data-testid="more-branch"
                  disabled={!live || !current}
                  onClick={() => {
                    setMoreAnchor(null)
                    openCreateBranch()
                  }}
                >
                  Create branch…
                </MenuItem>
                <MenuItem
                  data-testid="more-branch-delete"
                  disabled={!live}
                  onClick={() => {
                    setMoreAnchor(null)
                    void doDeleteBranchPrompt()
                  }}
                >
                  Delete branch…
                </MenuItem>
                <MenuItem
                  data-testid="more-checkout"
                  disabled={!live}
                  onClick={() => {
                    setMoreAnchor(null)
                    openCheckoutBranch()
                  }}
                >
                  Checkout branch…
                </MenuItem>
                <MenuItem data-testid="more-merge" disabled>
                  Merge… (coming soon)
                </MenuItem>
                <MenuItem
                  data-testid="more-rebase"
                  disabled={!live || !current}
                  onClick={() => {
                    setMoreAnchor(null)
                    openRebase()
                  }}
                >
                  Rebase…
                </MenuItem>
                <MenuItem
                  data-testid="more-tag"
                  disabled={!live || !current}
                  onClick={() => {
                    setMoreAnchor(null)
                    openCreateTag()
                  }}
                >
                  Create tag…
                </MenuItem>
              </Menu>
            </>
          )}
          {/* Git Extensions status strip: branch, ahead/behind vs upstream,
              dirty count; engine build info stays muted at the far right.
              The dirty count is always parenthesized (even "(0 changes)")
              so `engine-status` keeps a "(" once a repo is live, which
              several e2e specs use as a "real repo data has loaded" signal
              regardless of upstream/dirty state. */}
        </Toolbar>
        {!live && !offline && health !== null && (
          <LinearProgress data-testid="boot-progress" sx={{ height: 2 }} />
        )}
        {busy && jobLabel !== null && <LinearProgress sx={{ height: 2 }} />}
        </AppBar>
        {engineError && (
          <Alert
            data-testid="error-banner"
            severity="error"
            sx={{ borderRadius: 0, py: 0.25 }}
            action={
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Tooltip title="Copy error text">
                  <IconButton
                    data-testid="error-banner-copy"
                    size="small"
                    color="inherit"
                    aria-label="Copy error text"
                    onClick={() => void copyToClipboard(engineError)}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <IconButton
                  data-testid="error-banner-close"
                  size="small"
                  color="inherit"
                  aria-label="Dismiss"
                  onClick={() => setEngineError(null)}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            }
          >
            {engineError}
          </Alert>
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
              <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
                {rows.length === 0 && !loadingTail && (
                  <Box data-testid="grid-empty" sx={{ p: 3, display: "flex", justifyContent: "center" }}>
                    {engineError ? (
                      <Alert
                        severity="error"
                        variant="outlined"
                        sx={{ maxWidth: 560 }}
                        action={
                          <Button size="small" onClick={() => void refresh()}>
                            Retry
                          </Button>
                        }
                      >
                        Could not load history. {engineError}
                      </Alert>
                    ) : (
                      <Typography color="text.secondary" variant="body2">
                        {repo ? "This repository has no commits yet." : "Open a repository to see its history."}
                      </Typography>
                    )}
                  </Box>
                )}
                <RevisionGrid
                  rows={rows}
                  selected={selected}
                  onSelect={(i) => setSelectedSha(rows[i]?.rev.id ?? null)}
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
              // A GTK focus steal mid-drag fires pointercancel, never
              // pointerup; without these the handle stays stuck to the cursor.
              onPointerCancel={onDividerUp}
              onLostPointerCapture={onDividerUp}
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
      {/* Status bar. This used to be squeezed into the right-hand end of the
          toolbar, where it was truncated to unreadable stubs ("powe... 0...
          (14 chan... git version 2.38.1...") at every window size, and it stole the
          width the buttons needed. A dedicated bottom bar is what Git
          Extensions and every IDE does, and it gives the repo state a place
          that cannot run out of room: branch and dirty count are pinned left,
          the build info is the only thing allowed to be elided. */}
      <Box
        data-testid="engine-status"
        sx={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          height: 24,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          overflow: "hidden",
        }}
      >
        {live && repo ? (
          <>
            <Typography data-testid="status-branch" variant="caption" noWrap sx={{ fontWeight: 700, flexShrink: 0 }}>
              {repo.branch}
            </Typography>
            {status?.ahead != null && status?.behind != null && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
                {`\u2191${status.ahead} \u2193${status.behind}`}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
              {`(${dirty} change${dirty === 1 ? "" : "s"})`}
            </Typography>
          </>
        ) : (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
            {health
              ? "no repository"
              : offline
                ? "sample data \u2014 connect an engine for real repositories"
                : "connecting\u2026"}
          </Typography>
        )}
        {/* Long-running work reports here, the way VS Code does, rather than
            floating over the toolbar buttons. */}
        {progressLabel !== null && (
          <Box
            data-testid="topbar-progress"
            sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, pointerEvents: "none" }}
          >
            <CircularProgress size={12} thickness={5} />
            <Typography variant="caption" color="text.secondary" noWrap>
              {progressLabel}
            </Typography>
          </Box>
        )}
        {health && (
          <Typography
            data-testid="status-build"
            variant="caption"
            color="text.disabled"
            noWrap
            sx={{ ml: "auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {`${health.gitVersion} \u00b7 engine ${health.engine}`}
          </Typography>
        )}
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
          focusGrid()
        }}
        onStatus={setStatus}
        onCommit={async (msg) => {
          await onCommit(msg)
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false)
          focusGrid()
        }}
      />
      <RecentsDialog
        open={recentsOpen}
        onClose={() => {
          setRecentsOpen(false)
          focusGrid()
        }}
        recents={recents}
        onPick={(p) => {
          if (p) onOpenFolder(p)
        }}
      />

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
        <RemoteDialog
          open
          name={remoteConfigFor}
          onClose={() => {
            setRemoteConfigFor(null)
            focusGrid()
          }}
        />
      )}
      <StashDialog
        open={stashOpen}
        dirtyCount={dirty}
        onClose={() => {
          setStashOpen(false)
          void refresh({ revisions: true, status: true, stashes: true })
          focusGrid()
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
// Icon-only variant used by the collapsed tiers: square, no label box, so a
// row of them reads as a compact icon bar rather than a row of empty buttons.
const TOOLBAR_ICON_SX = {
  height: 26,
  minWidth: "26px !important",
  width: 26,
  px: 0,
  py: 0,
  "& .MuiSvgIcon-root": { fontSize: 18 },
} as const

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
  compact = false,
  onMainClick,
  children,
}: {
  label: string
  icon?: ReactNode
  testid: string
  variant?: "outlined" | "contained"
  disabled?: boolean
  shortcut?: string
  compact?: boolean
  onMainClick: () => void
  children?: ReactNode
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  // Collapsed to an icon there is no visible label, so the tooltip carries
  // the whole meaning — it always names the action, with the shortcut only
  // as a suffix.
  const hint = shortcut ? `${label} (${shortcut})` : label
  const iconOnly = compact && icon !== undefined
  return (
    <>
      <ButtonGroup size="small" variant={variant} disabled={disabled}>
        <Button
          data-testid={testid}
          startIcon={iconOnly ? undefined : icon}
          aria-label={label}
          title={hint}
          onClick={onMainClick}
          sx={iconOnly ? TOOLBAR_ICON_SX : TOOLBAR_BUTTON_SX}
        >
          {iconOnly ? icon : label}
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
  compact = false,
  onClick,
}: {
  label: string
  icon: ReactNode
  testid: string
  disabled?: boolean
  shortcut?: string
  compact?: boolean
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const hint = shortcut ? `${label} (${shortcut})` : label
  return (
    <Button
      size="small"
      variant="outlined"
      data-testid={testid}
      startIcon={compact ? undefined : icon}
      disabled={disabled}
      aria-label={label}
      title={hint}
      onClick={onClick}
      sx={compact ? TOOLBAR_ICON_SX : TOOLBAR_BUTTON_SX}
    >
      {compact ? icon : label}
    </Button>
  )
}

import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined"
import ViewListOutlinedIcon from "@mui/icons-material/ViewListOutlined"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import LinearProgress from "@mui/material/LinearProgress"
import Paper from "@mui/material/Paper"
import Tab from "@mui/material/Tab"
import Tabs from "@mui/material/Tabs"
import Typography from "@mui/material/Typography"
import { useCallback, useEffect, useRef, useState } from "react"
import { CommitFileTree } from "./CommitFileTree"
import { CompactFileList } from "./CompactFileList"
import { SplitHandle } from "./SplitHandle"
import { BlobPane } from "./BlobPane"
import { EmptyState, ErrorState, LoadingState } from "./AsyncState"
import { CommitDetailView } from "./CommitDetailView"
import { DiffPane } from "./DiffPane"
import type { Loadable } from "./loadable"
import {
  describeThrown,
  isAbort,
  useEngine,
  type CommitDetail,
  type DiffDto,
  type DiffOptions,
  type FileChange,
} from "../engine"
import type { GraphRow } from "../graph/types"

type Props = {
  current: GraphRow | undefined
  height: number
  tab?: number
  onTab?: (tab: number) => void
}

import { DEFAULT_DIFF_OPTIONS, commitData, forgetCommit } from "../engine/commitCache"

const FILES_WIDTH_STORAGE_KEY = "pg.bottomFilesWidth"
const DEFAULT_FILES_WIDTH = 340
const MIN_FILES_WIDTH = 180
const MAX_FILES_WIDTH_RATIO = 0.7

function readStoredFilesWidth(): number {
  try {
    const raw = window.localStorage.getItem(FILES_WIDTH_STORAGE_KEY)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FILES_WIDTH
  } catch {
    return DEFAULT_FILES_WIDTH
  }
}

function writeStoredFilesWidth(width: number): void {
  try {
    window.localStorage.setItem(FILES_WIDTH_STORAGE_KEY, String(Math.round(width)))
  } catch {
    // Ignore storage failures (private mode, quota exceeded, disabled).
  }
}

/** True once `pending` has been continuously true for `delayMs`; a short
 *  load never shows an indicator, a long one shows it without flicker. */
function useDelayed(pending: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!pending) {
      setShown(false)
      return
    }
    const t = setTimeout(() => setShown(true), delayMs)
    return () => clearTimeout(t)
  }, [pending, delayMs])
  return shown && pending
}

export function BottomPanel({ current, height, tab: tabProp, onTab }: Props) {
  const engine = useEngine()
  const [tabState, setTabState] = useState(0)
  const tab = tabProp ?? tabState
  const setTab = onTab ?? setTabState
  const [detail, setDetail] = useState<Loadable<CommitDetail>>({ kind: "idle" })
  const [files, setFiles] = useState<FileChange[]>([])
  const [file, setFile] = useState<string | null>(null)
  const [diff, setDiff] = useState<Loadable<DiffDto>>({ kind: "idle" })
  const [diffOpts, setDiffOpts] = useState<DiffOptions>(DEFAULT_DIFF_OPTIONS)
  const [treeFile, setTreeFile] = useState<string | null>(null)
  const [blob, setBlob] = useState<Loadable<DiffDto>>({ kind: "idle" })
  const [diffToolError, setDiffToolError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  // Diff tab file list as a directory tree (pg.diffTree) or flat paths.
  const [treeMode, setTreeModeState] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem("pg.diffTree") === "1"
    } catch {
      return false
    }
  })
  const setTreeMode = (update: (t: boolean) => boolean) =>
    setTreeModeState((t) => {
      const next = update(t)
      try {
        window.localStorage.setItem("pg.diffTree", next ? "1" : "0")
      } catch {
        // Storage refused: the choice still applies for this window.
      }
      return next
    })
  // Which commit the current `files`/`file` belong to, and which
  // (commit, path, options) the current diff was loaded for. Both keep the
  // diff effect from firing for a stale file when the commit changes, and
  // from re-requesting a diff that arrived with the file list.
  const filesFor = useRef<string | null>(null)
  const diffFor = useRef<string | null>(null)
  const lastCommitChange = useRef(0)
  // Read at request time, not a dependency: changing the diff options must
  // reload the diff (effect below), not the commit details and file list.
  const diffOptsRef = useRef(diffOpts)
  diffOptsRef.current = diffOpts
  // Shared by the Files (Diff) tab and File Tree tab so both file columns
  // resize together and remember one width across sessions.
  const [filesWidth, setFilesWidth] = useState<number>(() => readStoredFilesWidth())
  const panelRef = useRef<HTMLDivElement | null>(null)

  const commitId = current && current.rev.id.length >= 16 ? current.rev.id : null

  // Latest selection wins (v0.13.11): every request below is tied to an
  // AbortController the cleanup aborts, so arrow-keying through rows never
  // leaves stale git children running or stale responses applied.
  useEffect(() => {
    if (!commitId) {
      setDetail({ kind: "idle" })
      setFiles([])
      setFile(null)
      setDiff({ kind: "idle" })
      setTreeFile(null)
      setBlob({ kind: "idle" })
      setDiffToolError(null)
      return
    }
    const ctrl = new AbortController()
    // Reset selection state as soon as the commit changes. Keeping these
    // inside the debounced request allowed a fast tree response to become
    // interactive first, then erased the user's new file selection when the
    // 150 ms timer fired (especially visible on Linux's local fixture repo).
    // Keep the previous commit's details, file list and diff on screen,
    // marked stale, until the new ones arrive: no blank "Loading…" swap
    // between selections. The diff effect will not request the stale file
    // against the new commit (filesFor guard below).
    setDetail((d) => (d.kind === "ready" ? { ...d, stale: true } : { kind: "loading" }))
    setDiff((d) => (d.kind === "ready" ? { ...d, stale: true } : d.kind === "error" ? { kind: "idle" } : d))
    setTreeFile(null)
    setBlob({ kind: "idle" })
    setDiffToolError(null)
    // Leading-edge debounce: a single click fires at once; only a rapid run
    // of selection changes (arrow-keying, click-scrubbing) waits 150 ms so
    // intermediate rows do not each cost two engine requests.
    const now = performance.now()
    const delay = now - lastCommitChange.current < 250 ? 150 : 0
    lastCommitChange.current = now
    const timer = setTimeout(() => {
      // Shared with the click-time prefetch (engine/commitCache): usually the
      // requests are already in flight when this runs. Stale answers are
      // ignored via `ctrl`, not aborted, so the cache entry stays usable.
      if (reloadTick > 0) forgetCommit(engine, commitId, diffOptsRef.current)
      const data = commitData(engine, commitId, diffOptsRef.current)
      data.commit
        .then((d) => {
          if (!ctrl.signal.aborted) setDetail({ kind: "ready", value: d })
        })
        .catch((e: unknown) => {
          if (!ctrl.signal.aborted && !isAbort(e))
            setDetail({ kind: "error", message: `commit failed: ${describeThrown(e)}` })
        })
      // One round trip for the file list and the first file's diff.
      data.changes
        .then((changes) => {
          if (ctrl.signal.aborted) return
          filesFor.current = commitId
          setFiles(changes.files)
          const first = changes.files[0]?.path ?? null
          setFile(first)
          if (first && changes.firstDiff && changes.firstDiff.path === first) {
            diffFor.current = `${commitId}|${first}|${JSON.stringify(diffOptsRef.current)}`
            setDiff({ kind: "ready", value: changes.firstDiff })
          }
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setFiles([])
        })
    }, delay)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [engine, commitId, reloadTick])

  useEffect(() => {
    if (!commitId || !file || tab === 2) {
      if (tab !== 1) setDiff({ kind: "idle" })
      return
    }
    // The file list still belongs to the previous commit: the changes()
    // request above will deliver the new list and first diff; asking for
    // the old path against the new commit is a wasted round trip.
    if (filesFor.current !== commitId) return
    const key = `${commitId}|${file}|${JSON.stringify(diffOpts)}`
    if (diffFor.current === key) return
    const ctrl = new AbortController()
    setDiff((d) => (d.kind === "ready" && d.value.path === file ? d : { kind: "loading" }))
    engine
      .diff(commitId, file, diffOpts, ctrl.signal)
      .then((d) => {
        if (ctrl.signal.aborted) return
        diffFor.current = key
        setDiff({ kind: "ready", value: d })
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted && !isAbort(e))
          setDiff({ kind: "error", message: `diff failed: ${describeThrown(e)}` })
      })
    return () => ctrl.abort()
  }, [engine, commitId, file, diffOpts, tab, reloadTick])

  useEffect(() => {
    if (!commitId || !treeFile) {
      setBlob({ kind: "idle" })
      return
    }
    const ctrl = new AbortController()
    setBlob({ kind: "loading" })
    engine
      .blob(commitId, treeFile, ctrl.signal)
      .then((b) => {
        if (!ctrl.signal.aborted) setBlob({ kind: "ready", value: b })
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted && !isAbort(e))
          setBlob({ kind: "error", message: `open failed: ${describeThrown(e)}` })
      })
    return () => ctrl.abort()
  }, [engine, commitId, treeFile, reloadTick])

  const reload = useCallback(() => setReloadTick((t) => t + 1), [])
  // One thin bar for the whole panel once a load has run for 200 ms; short
  // loads (the common case after v0.13.14) show nothing at all.
  const pending =
    detail.kind === "loading" ||
    (detail.kind === "ready" && detail.stale === true) ||
    diff.kind === "loading" ||
    (diff.kind === "ready" && diff.stale === true)
  const busy = useDelayed(pending, 200)

  const splitHandleProps = {
    testid: "bottom-split-handle",
    value: filesWidth,
    defaultValue: DEFAULT_FILES_WIDTH,
    min: MIN_FILES_WIDTH,
    maxRatio: MAX_FILES_WIDTH_RATIO,
    getContainerWidth: () => panelRef.current?.clientWidth ?? filesWidth,
    onChange: setFilesWidth,
    onCommit: writeStoredFilesWidth,
  }

  // Files tab double-click: opens the file in the configured external diff
  // tool (git difftool, e.g. VS Code) instead of doing nothing. The engine
  // runs the tool in the background and returns immediately, so this only
  // surfaces a validation/startup error, not the tool's own exit status.
  function openInDifftool(path: string) {
    if (!commitId) return
    setDiffToolError(null)
    void engine
      .openDifftool(commitId, path)
      .catch((e: unknown) => setDiffToolError(`open in diff tool failed: ${describeThrown(e)}`))
  }

  return (
    <Paper
      data-testid="bottom-panel"
      sx={{ height, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <Tabs
        value={tab}
        onChange={(_, v: number) => setTab(v)}
        sx={{
          px: 0.5,
          minHeight: 34,
          "& .MuiTab-root": { minHeight: 34, py: 0.5 },
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Tab label="Commit" />
        <Tab label={`Diff${files.length ? ` (${files.length})` : ""}`} />
        <Tab label="File Tree" />
      </Tabs>
      <Box sx={{ height: 2, flexShrink: 0 }}>
        {busy && <LinearProgress data-testid="panel-busy" sx={{ height: 2 }} />}
      </Box>
      <Box
        ref={panelRef}
        sx={{ flex: 1, minHeight: 0, display: "flex", opacity: busy ? 0.6 : 1, transition: "opacity 120ms" }}
      >
        {tab === 0 && <CommitInfo detail={detail} hasCurrent={current !== undefined} onRetry={reload} busy={busy} />}
        {tab === 1 && (
          <>
            <Box
              sx={{
                width: filesWidth,
                flexShrink: 0,
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
                position: "relative",
              }}
            >
              <CompactFileList
                testid="file-list"
                files={files}
                tree={treeMode}
                selectedPath={file}
                emptyText="No files for this revision."
                onSelect={(f) => setFile(f.path)}
                onRowDoubleClick={(f) => openInDifftool(f.path)}
              />
              {diffToolError && (
                <Typography
                  data-testid="difftool-error"
                  variant="caption"
                  color="error"
                  sx={{ px: 1, py: 0.5, flexShrink: 0 }}
                >
                  {diffToolError}
                </Typography>
              )}
              {/* Owner (v0.13.16): "a floating transparent button to activate a
                  mode 'hierarchical' view" — flat paths or a directory tree. */}
              <Tooltip title={treeMode ? "Show full paths" : "Group by directory"} placement="left">
                <IconButton
                  size="small"
                  data-testid="file-list-mode"
                  aria-label={treeMode ? "Show full paths" : "Group by directory"}
                  onClick={() => setTreeMode((t) => !t)}
                  sx={{
                    position: "absolute",
                    right: 10,
                    bottom: 8,
                    bgcolor: "rgba(21, 83, 201, 0.10)",
                    color: "primary.main",
                    backdropFilter: "blur(4px)",
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
              file={file}
              options={diffOpts}
              onOptions={setDiffOpts}
              onRetry={reload}
              onOpenDifftool={file ? () => openInDifftool(file) : undefined}
            />
          </>
        )}
        {tab === 2 && (
          <>
            <Box sx={{ width: filesWidth, flexShrink: 0, overflow: "auto" }} data-testid="commit-file-tree-wrap">
              <CommitFileTree commitId={commitId} onSelectFile={(path) => setTreeFile(path)} />
            </Box>
            <SplitHandle {...splitHandleProps} />
            {blob.kind === "error" ? (
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <ErrorState message={blob.message} onRetry={reload} testid="blob-error" />
              </Box>
            ) : (
              <BlobPane
                blob={blob.kind === "ready" ? blob.value : null}
                path={treeFile}
                onRetry={reload}
                onOpenDifftool={treeFile ? () => openInDifftool(treeFile) : undefined}
              />
            )}
          </>
        )}
      </Box>
    </Paper>
  )
}

function CommitInfo({
  detail,
  hasCurrent,
  onRetry,
  busy,
}: {
  detail: Loadable<CommitDetail>
  hasCurrent: boolean
  onRetry: () => void
  busy: boolean
}) {
  return (
    <Box data-testid="commit-info" sx={{ flex: 1, overflow: "auto", p: detail.kind === "ready" ? 2 : 0 }}>
      {detail.kind === "error" && <ErrorState message={detail.message} onRetry={onRetry} testid="commit-error" />}
      {detail.kind === "loading" && busy && <LoadingState label="Loading commit…" testid="commit-loading" />}
      {detail.kind === "idle" && (
        <EmptyState text={hasCurrent ? "Loading commit…" : "Select a revision"} testid="commit-empty" />
      )}
      {detail.kind === "ready" && <CommitDetailView detail={detail.value} />}
    </Box>
  )
}

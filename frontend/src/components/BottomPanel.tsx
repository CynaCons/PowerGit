import Box from "@mui/material/Box"
import LinearProgress from "@mui/material/LinearProgress"
import Paper from "@mui/material/Paper"
import { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { CommitFileTree } from "./CommitFileTree"
import { SplitHandle } from "./SplitHandle"
import { BlobPane } from "./BlobPane"
import { ErrorState } from "./AsyncState"
import { CommitInfo } from "./CommitDetailView"
import { DiffTab, type DiffTabActions } from "./DiffTab"
import { BottomTabStrip } from "./BottomTabStrip"
import {
  DEFAULT_FILES_WIDTH,
  MAX_FILES_WIDTH_RATIO,
  MIN_FILES_WIDTH,
  readStoredFilesWidth,
  writeStoredFilesWidth,
} from "./filesWidth"
import type { BrowseRow } from "./browseReset"
import type { Loadable } from "./loadable"
import {
  describeThrown,
  isAbort,
  useEngine,
  type CommitDetail,
  type DiffDto,
  type DiffOptions,
  type FileChange,
  type RepoStatus,
} from "../engine"
import type { GraphRow } from "../graph/types"
import { rowKeysOf, type RowKeys } from "../hooks/useDiffReview"
import { useReview } from "../hooks/useReview"
import { reviewKeyOf } from "../review/reviewKey"
import { getReviewDoc } from "../review/reviewState"
import type { GridMenus } from "../hooks/useGridMenus"

type Props = {
  current: GraphRow | undefined
  /** Pending-change rows (v0.14.1) read their files from the status. */
  status: RepoStatus | null
  /** HEAD's sha: the File Tree of a pending row is the tree at HEAD. */
  headId: string | null
  onOpenCommit: () => void
  height: number
  tab?: number
  onTab?: (tab: number) => void
  /** Lets the Diff tab mutate (v0.15.5); omitted, the panel stays read-only.
   *  A useState setter, so its identity is stable and memoisation holds. */
  setStatus?: (status: RepoStatus) => void
  /** v0.16.0: "View file history" from the Diff tab's list and the File Tree. */
  onFileHistory?: (path: string, sha?: string | null) => void
  /** v0.16.0: the file the visible tab has selected (Diff list or File Tree), for Ctrl+Shift+H. */
  onSelectedFile?: (path: string | null) => void
  /** v0.18.3: the Commit tab's Refs row classifies chips as the grid does. */
  tagNames?: string[]
  remoteNames?: string[]
  /** A chip clicked: select that ref's tip in the grid. */
  onSelectRef?: (name: string) => void
  /** A chip right-clicked: the grid's ref menu. */
  menus?: GridMenus
}

import { DEFAULT_DIFF_OPTIONS, commitData, forgetCommit } from "../engine/commitCache"
import { PendingSummary } from "./PendingSummary"
import { usePendingOf, usePendingDiff } from "./pendingRows"

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

export function BottomPanel({
  current,
  status,
  headId,
  onOpenCommit,
  height,
  tab: tabProp,
  onTab,
  setStatus,
  onFileHistory,
  onSelectedFile,
  tagNames,
  remoteNames,
  onSelectRef,
  menus,
}: Props) {
  const engine = useEngine()
  const pendingRow = usePendingOf(current, status)
  const actions: DiffTabActions | undefined = useMemo(() => (setStatus ? { setStatus } : undefined), [setStatus])
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
  // Which of the three diffs the Diff tab is showing, so "reset" there can
  // mean the right git operation (v0.15.5, see browseReset.ts).
  const browseRow: BrowseRow | null = pendingRow
    ? { kind: pendingRow.kind }
    : commitId
      ? { kind: "commit", sha: commitId.slice(0, 7) }
      : null
  // Pending rows: files come from the status, the diff from the worktree.
  const pendingDiff = usePendingDiff(pendingRow, pendingRow ? file : null, diffOpts)
  const shownDiff = pendingRow ? pendingDiff : diff
  // Review mode (v0.17.0): one document per commit, or per HEAD and pending
  // row (docs/design/review-mode.md §1); null until HEAD is known. The row
  // keys of the diff on screen feed the Diff tab's marks and the bar once,
  // parsed from the text (memoised on it: a status poll refetches the same).
  const reviewKey = reviewKeyOf({ commitId, pending: pendingRow?.kind ?? null, headId })
  const { startOver, finish } = useReview({ engine, key: reviewKey })
  const shownText = shownDiff.kind === "ready" ? shownDiff.value.text : null
  const rowKeys = useMemo<RowKeys>(() => (shownText === null ? [] : rowKeysOf(shownText)), [shownText])
  const exportDiffs = useCallback(async () => {
    const result = new Map<string, string>()
    const doc = getReviewDoc(reviewKey)
    if (!doc) return result
    if (shownDiff.kind === "ready") result.set(shownDiff.value.path, shownDiff.value.text)
    await Promise.all(
      Object.keys(doc.files)
        .filter((path) => !result.has(path))
        .map(async (path) => {
          try {
            const value = commitId
              ? await engine.diff(commitId, path, diffOpts)
              : await engine.workTreeDiff(path, pendingRow?.kind === "index", diffOpts)
            result.set(path, value.text)
          } catch {
            /* A digest can still identify a mark whose diff failed. */
          }
        }),
    )
    return result
  }, [commitId, diffOpts, engine, pendingRow?.kind, reviewKey, shownDiff])
  useEffect(() => {
    if (!pendingRow) return
    setFiles(pendingRow.files)
    setFile((f) => (f && pendingRow.files.some((x) => x.path === f) ? f : (pendingRow.files[0]?.path ?? null)))
    setDetail({ kind: "idle" })
  }, [pendingRow])

  // Latest selection wins (v0.13.11): every request below is tied to an
  // AbortController the cleanup aborts, so arrow-keying through rows never
  // leaves stale git children running or stale responses applied.
  useEffect(() => {
    if (!commitId) {
      // A pending-change row has no commit; its effect above owns the files.
      if (pendingRow) return
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
      // The options this request was made with: the key below must name
      // them, not whatever the user picked while it was in flight, or a
      // context change made during the round trip is never fetched
      // (v0.18.4, floating-bars.spec on a slow engine).
      const opts = diffOptsRef.current
      if (reloadTick > 0) forgetCommit(engine, commitId, opts)
      const data = commitData(engine, commitId, opts)
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
            diffFor.current = `${commitId}|${first}|${JSON.stringify(opts)}`
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // The File Tree's blob: the commit's, or for a pending-change row (whose
  // tree is HEAD's, see CommitFileTree below) the file on disk (Working
  // directory) or in the index (Index), as Git Extensions' FileViewer reads
  // its artificial revisions. Owner (2026-09-11): "accessing a file in the
  // file tree when selecting the working directory pseudo commit doesn't
  // load." A primitive, not pendingRow: a status poll must not refetch.
  const pendingKind = pendingRow?.kind ?? null
  useEffect(() => {
    if (!treeFile || (!commitId && !pendingKind)) {
      setBlob({ kind: "idle" })
      return
    }
    const ctrl = new AbortController()
    setBlob({ kind: "loading" })
    const request = commitId
      ? engine.blob(commitId, treeFile, ctrl.signal)
      : engine.workTreeBlob(treeFile, pendingKind === "index", ctrl.signal)
    request
      .then((b) => {
        if (!ctrl.signal.aborted) setBlob({ kind: "ready", value: b })
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted && !isAbort(e))
          setBlob({ kind: "error", message: `open failed: ${describeThrown(e)}` })
      })
    return () => ctrl.abort()
  }, [engine, commitId, pendingKind, treeFile, reloadTick])

  // The file Ctrl+Shift+H opens the history of: the Diff tab's selection or
  // the File Tree's; nothing on the Commit tab.
  useEffect(() => {
    onSelectedFile?.(tab === 1 ? file : tab === 2 ? treeFile : null)
  }, [onSelectedFile, tab, file, treeFile])
  useEffect(() => () => onSelectedFile?.(null), [onSelectedFile])
  const fileHistory = onFileHistory ? (path: string) => onFileHistory(path, commitId) : undefined

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
    // SplitHandle moves this inherited variable directly, then commits state
    // on release so diff rows do not re-render per pointermove (v0.18.18).
    onChange: (width: number) => panelRef.current?.style.setProperty("--pg-files-width", `${width}px`),
    onCommit: (width: number) => {
      setFilesWidth(width)
      writeStoredFilesWidth(width)
    },
  }

  // Files tab double-click: opens the file in the configured external diff
  // tool (git difftool, e.g. VS Code) instead of doing nothing. The engine
  // runs the tool in the background and returns immediately, so this only
  // surfaces a validation/startup error, not the tool's own exit status.
  function openInDifftool(path: string) {
    setDiffToolError(null)
    if (pendingRow) {
      void engine
        .openWorkTreeDifftool(path, pendingRow.staged)
        .catch((e: unknown) => setDiffToolError(`open in diff tool failed: ${describeThrown(e)}`))
      return
    }
    if (!commitId) return
    void engine
      .openDifftool(commitId, path)
      .catch((e: unknown) => setDiffToolError(`open in diff tool failed: ${describeThrown(e)}`))
  }

  return (
    <Paper
      data-testid="bottom-panel"
      sx={{
        height: `var(--pg-bottom-height, ${height}px)`,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <BottomTabStrip
        tab={tab}
        setTab={setTab}
        fileCount={files.length}
        reviewKey={reviewKey}
        path={shownDiff.kind === "ready" ? shownDiff.value.path : null}
        rowKeys={rowKeys}
        startOver={startOver}
        finish={finish}
        exportDiffs={exportDiffs}
      />
      <Box sx={{ height: 2, flexShrink: 0 }}>
        {busy && <LinearProgress data-testid="panel-busy" sx={{ height: 2 }} />}
      </Box>
      <Box
        ref={panelRef}
        sx={{ flex: 1, minHeight: 0, display: "flex", opacity: busy ? 0.6 : 1, transition: "opacity 120ms" }}
      >
        {tab === 0 &&
          (pendingRow ? (
            <PendingSummary pending={pendingRow} branch={status?.branch ?? null} onOpenCommit={onOpenCommit} />
          ) : (
            <CommitInfo
              detail={detail}
              hasCurrent={current !== undefined}
              onRetry={reload}
              busy={busy}
              tagNames={tagNames}
              remoteNames={remoteNames}
              currentBranch={status?.branch}
              onSelectRef={onSelectRef}
              onRefContextMenu={menus?.refContextMenu}
            />
          ))}
        {tab === 1 && (
          <DiffTab
            files={files}
            selectedPath={file}
            onSelect={setFile}
            treeMode={treeMode}
            onToggleTreeMode={() => setTreeMode((t) => !t)}
            filesWidth={filesWidth}
            splitHandleProps={splitHandleProps}
            diff={shownDiff}
            busy={busy}
            options={diffOpts}
            onOptions={setDiffOpts}
            onRetry={reload}
            onOpenDifftool={openInDifftool}
            difftoolError={diffToolError}
            row={browseRow}
            commitId={commitId}
            actions={actions}
            onFileHistory={fileHistory}
            reviewKey={reviewKey}
            rowKeys={rowKeys}
          />
        )}
        {tab === 2 && (
          <>
            <Box
              sx={{ width: `var(--pg-files-width, ${filesWidth}px)`, flexShrink: 0, overflow: "auto" }}
              data-testid="commit-file-tree-wrap"
              // The row the tree belongs to, for specs that click into the
              // tree right after selecting a row: the panel's render is
              // deferred, so the tree can still be the previous row's for a
              // few frames (v0.18.18, file-tree-worktree.spec).
              data-row={current?.rev.id}
            >
              <CommitFileTree
                commitId={commitId ?? (pendingRow ? headId : null)}
                onSelectFile={(path) => setTreeFile(path)}
                onFileHistory={fileHistory}
              />
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

import CloseIcon from "@mui/icons-material/Close"
import HistoryIcon from "@mui/icons-material/History"
import RefreshIcon from "@mui/icons-material/Refresh"
import Box from "@mui/material/Box"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import IconButton from "@mui/material/IconButton"
import Paper from "@mui/material/Paper"
import Tab from "@mui/material/Tab"
import Tabs from "@mui/material/Tabs"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { useEffect, useMemo, useRef, useState } from "react"
import { describeThrown, isAbort, useEngine, type CommitDetail, type DiffDto, type DiffOptions } from "../engine"
import { DEFAULT_DIFF_OPTIONS } from "../engine/commitCache"
import { withArtificialRows } from "../graph/artificial"
import { focusGrid } from "../hooks/focusGrid"
import type { ChromeLayout } from "../hooks/useChromeLayout"
import type { EngineSession } from "../hooks/useEngineSession"
import type { GridMenus } from "../hooks/useGridMenus"
import { useHistory } from "../hooks/useHistory"
import type { RepoState } from "../hooks/useRepoState"
import { MONO_FONT } from "../theme"
import { ErrorState, LoadingState } from "./AsyncState"
import { BlobPane } from "./BlobPane"
import { CommitDetailView } from "./CommitDetailView"
import { DiffPane } from "./DiffPane"
import {
  fileHistoryFilter,
  fileHistoryTabs,
  fileHistoryTitle,
  pathAtRow,
  pendingCount,
  readFileHistoryOptions,
  resolveFileHistoryTab,
  writeFileHistoryOptions,
  type FileHistoryOptions,
  type FileHistoryTab,
} from "./fileHistoryModel"
import { HistoryPane } from "./HistoryPane"
import type { Loadable } from "./loadable"

// Git Extensions' FormFileHistory (v0.16.0). Owner: "In main view, in the
// file tree, right click a file and show the file history. Here again, we
// have to be functionally equivalent to GE." GE opens a window with the
// revision grid limited to one path over a Commit / Diff / View / Blame tab
// strip, and a menu with "Detect and follow renames", "exact renames and
// copies only", "Show full history" and "Simplify merges". PowerGit shows
// the same thing in place of the main graph and panel (Escape or the X
// brings them back; their state stays in App, so nothing is refetched):
// the grid is the same RevisionGrid on a second useHistory whose pages ask
// the engine for `?path=`, and the tabs reuse the panel's own panes. Blame
// is absent because PowerGit has no blame view yet. The rules of what shows
// when are in fileHistoryModel.ts.

export type FileHistoryTarget = { path: string; sha: string | null }

type Props = {
  target: FileHistoryTarget
  session: Pick<EngineSession, "client" | "view" | "setEngineError" | "handleFailure">
  repoState: Pick<RepoState, "status" | "openFolder">
  layout: Pick<ChromeLayout, "bottomHeight" | "splitter">
  menus: GridMenus
  remoteNames: string[]
  tagNames: string[]
  /** HEAD of the main history: when it moves (commit, checkout, reset) the filtered list reloads. */
  headId: string | null
  onClose: () => void
}

function Toggle({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <FormControlLabel
      sx={{ mr: 1, ml: 0, "& .MuiFormControlLabel-label": { fontSize: 12 } }}
      control={
        <Checkbox
          size="small"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          sx={{ py: 0, px: 0.5 }}
          data-testid={`file-history-${id}`}
        />
      }
      label={label}
    />
  )
}

export function FileHistoryView({
  target,
  session,
  repoState,
  layout,
  menus,
  remoteNames,
  tagNames,
  headId,
  onClose,
}: Props) {
  const { path } = target
  const { client, view, setEngineError, handleFailure } = session
  const engine = useEngine()
  const [options, setOptionsState] = useState<FileHistoryOptions>(() =>
    readFileHistoryOptions(typeof window === "undefined" ? null : window.localStorage),
  )
  const setOptions = (patch: Partial<FileHistoryOptions>) =>
    setOptionsState((o) => {
      const next = { ...o, ...patch }
      writeFileHistoryOptions(typeof window === "undefined" ? null : window.localStorage, next)
      return next
    })
  const filter = useMemo(() => fileHistoryFilter(path, options), [path, options])
  const history = useHistory({ client, demo: false, live: view.live, setEngineError, onFailure: handleFailure, filter })
  const { rows: engineRows, selectedSha, setSelectedSha, loadingTail, loaded, resetHistory, reloadHistory } = history

  // Load on open and whenever the filter changes (a different filter is a
  // different list, so the loaded tail is dropped rather than spliced).
  useEffect(() => {
    resetHistory()
    void reloadHistory()
  }, [resetHistory, reloadHistory])
  // GE opens on the revision the history was started from, when it is in
  // the list; the default (row 0) otherwise.
  const initialSha = useRef(target.sha)
  useEffect(() => {
    if (loaded && initialSha.current) {
      setSelectedSha(initialSha.current)
      initialSha.current = null
    }
  }, [loaded, setSelectedSha])
  // HEAD moved under the view (a commit from Ctrl+Space, a checkout): refetch.
  const lastHead = useRef(headId)
  useEffect(() => {
    if (lastHead.current === headId) return
    lastHead.current = headId
    void reloadHistory()
  }, [headId, reloadHistory])
  useEffect(() => focusGrid(), [])

  // Pending-change rows on top, as GE shows its artificial commits in the
  // file history when the file is modified; anchored to the newest commit
  // that touched the path when HEAD did not.
  const status = repoState.status
  const counts = useMemo(
    () =>
      status
        ? { unstagedCount: pendingCount(path, status.unstaged), stagedCount: pendingCount(path, status.staged) }
        : null,
    [status, path],
  )
  const rows = useMemo(() => withArtificialRows(engineRows, counts, 0), [engineRows, counts])
  const selected = useMemo(() => {
    const i = selectedSha ? rows.findIndex((r) => r.rev.id === selectedSha) : -1
    return i >= 0 ? i : rows.length > 0 ? 0 : -1
  }, [rows, selectedSha])
  const current = selected >= 0 ? rows[selected] : undefined
  const at = pathAtRow(current, path)
  const tabs = fileHistoryTabs(current, path)
  const [wantedTab, setWantedTab] = useState<FileHistoryTab>("diff")
  const tab = resolveFileHistoryTab(wantedTab, tabs)

  const [diffOpts, setDiffOpts] = useState<DiffOptions>(DEFAULT_DIFF_OPTIONS)
  const [detail, setDetail] = useState<Loadable<CommitDetail>>({ kind: "idle" })
  const [diff, setDiff] = useState<Loadable<DiffDto>>({ kind: "idle" })
  const [blob, setBlob] = useState<Loadable<DiffDto>>({ kind: "idle" })
  const [reloadTick, setReloadTick] = useState(0)
  const commitId = current && !current.artificial ? current.rev.id : null
  const pendingStaged = current?.artificial === "index"
  // Primitives for the effects: `current` is rebuilt on every status poll.
  const pending = current?.artificial !== undefined

  // Only the visible tab loads (GE UpdateSelectedFileViewers); latest
  // selection wins through the abort.
  useEffect(() => {
    if (tab !== "commit" || !commitId) return
    const ctrl = new AbortController()
    setDetail((d) => (d.kind === "ready" ? { ...d, stale: true } : { kind: "loading" }))
    engine
      .commit(commitId, ctrl.signal)
      .then((d) => {
        if (!ctrl.signal.aborted) setDetail({ kind: "ready", value: d })
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted && !isAbort(e)) setDetail({ kind: "error", message: describeThrown(e) })
      })
    return () => ctrl.abort()
  }, [engine, tab, commitId, reloadTick])

  useEffect(() => {
    if (tab !== "diff" || !current) return
    const ctrl = new AbortController()
    setDiff((d) => (d.kind === "ready" ? { ...d, stale: true } : { kind: "loading" }))
    const request = current.artificial
      ? engine.workTreeDiff(path, pendingStaged, diffOpts, ctrl.signal)
      : engine.diff(current.rev.id, at, diffOpts, ctrl.signal)
    request
      .then((d) => {
        if (!ctrl.signal.aborted) setDiff({ kind: "ready", value: d })
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted && !isAbort(e))
          setDiff({ kind: "error", message: `diff failed: ${describeThrown(e)}` })
      })
    return () => ctrl.abort()
  }, [engine, tab, current, path, at, pendingStaged, diffOpts, reloadTick])

  // View: the blob at the commit, or for a pending row the file on disk /
  // in the index, as the main File Tree shows it for that row.
  useEffect(() => {
    if (tab !== "view" || (!commitId && !pending)) return
    const ctrl = new AbortController()
    setBlob({ kind: "loading" })
    const request = commitId
      ? engine.blob(commitId, at, ctrl.signal)
      : engine.workTreeBlob(at, pendingStaged, ctrl.signal)
    request
      .then((b) => {
        if (!ctrl.signal.aborted) setBlob({ kind: "ready", value: b })
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted && !isAbort(e))
          setBlob({ kind: "error", message: `open failed: ${describeThrown(e)}` })
      })
    return () => ctrl.abort()
  }, [engine, tab, commitId, pending, pendingStaged, at, reloadTick])

  const reload = () => setReloadTick((t) => t + 1)
  const openDifftool = () => {
    if (!current) return
    const request = current.artificial
      ? engine.openWorkTreeDifftool(path, pendingStaged)
      : engine.openDifftool(current.rev.id, at)
    void request.catch((e: unknown) => setEngineError(`open in diff tool failed: ${describeThrown(e)}`))
  }
  const busy = diff.kind === "loading" || (diff.kind === "ready" && diff.stale === true)

  return (
    <Box
      data-testid="file-history"
      data-path={path}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return
        e.stopPropagation()
        onClose()
      }}
      sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <Box
        data-testid="file-history-header"
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 0.5,
          px: 1,
          minHeight: 34,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <HistoryIcon fontSize="small" sx={{ color: "text.secondary" }} />
        <Typography variant="subtitle2" sx={{ mr: 0.5 }}>
          File history
        </Typography>
        <Typography
          data-testid="file-history-path"
          noWrap
          title={fileHistoryTitle(path, at)}
          sx={{ fontFamily: MONO_FONT, fontSize: 12.5, minWidth: 0, flex: "0 1 auto" }}
        >
          {fileHistoryTitle(path, at)}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Toggle
          id="follow"
          label="Follow renames"
          checked={options.follow}
          onChange={(v) => setOptions({ follow: v })}
        />
        <Toggle
          id="exact"
          label="Exact renames only"
          checked={options.exact}
          disabled={!options.follow}
          onChange={(v) => setOptions({ exact: v })}
        />
        <Toggle id="full" label="Full history" checked={options.full} onChange={(v) => setOptions({ full: v })} />
        <Toggle
          id="simplify"
          label="Simplify merges"
          checked={options.simplify}
          disabled={!options.full}
          onChange={(v) => setOptions({ simplify: v })}
        />
        <Tooltip title="Reload file history">
          <IconButton
            size="small"
            data-testid="file-history-reload"
            aria-label="Reload file history"
            onClick={() => {
              void reloadHistory()
              reload()
            }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Back to the full history (Esc)">
          <IconButton size="small" data-testid="file-history-close" aria-label="Close file history" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <HistoryPane
        rows={rows}
        remoteNames={remoteNames}
        tagNames={tagNames}
        selected={selected}
        loadingTail={loadingTail}
        loading={view.live && !loaded}
        engineError={null}
        view={view}
        emptyText={`No commit touches ${path}.`}
        onSelect={(i) => setSelectedSha(rows[i]?.rev.id ?? null)}
        onNearEnd={history.onNearEnd}
        menus={menus}
        selectedSha={selectedSha}
        onRetry={() => void reloadHistory()}
        onOpenRepo={() => void repoState.openFolder()}
        onRecover={onClose}
      />
      <Box
        data-testid="file-history-splitter"
        onPointerDown={layout.splitter.onDividerDown}
        onPointerMove={layout.splitter.onDividerMove}
        onPointerUp={layout.splitter.onDividerUp}
        onPointerCancel={layout.splitter.onDividerUp}
        onLostPointerCapture={layout.splitter.onDividerUp}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize bottom panel"
        sx={{
          height: 5,
          flexShrink: 0,
          cursor: "row-resize",
          bgcolor: "background.default",
          borderTop: 1,
          borderColor: "divider",
          "&:hover": { bgcolor: "primary.main" },
        }}
      />
      <Paper
        data-testid="file-history-panel"
        sx={{
          height: layout.bottomHeight,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, v: FileHistoryTab) => setWantedTab(v)}
          sx={{
            px: 0.5,
            minHeight: 34,
            "& .MuiTab-root": { minHeight: 34, py: 0.5 },
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          {tabs.includes("commit") && <Tab label="Commit" value="commit" />}
          {tabs.includes("diff") && <Tab label="Diff" value="diff" />}
          {tabs.includes("view") && <Tab label="View" value="view" />}
        </Tabs>
        <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
          {tab === "commit" && (
            <Box
              data-testid="file-history-commit"
              sx={{ flex: 1, overflow: "auto", p: detail.kind === "ready" ? 2 : 0 }}
            >
              {detail.kind === "error" && (
                <ErrorState message={detail.message} onRetry={reload} testid="commit-error" />
              )}
              {detail.kind === "loading" && <LoadingState label="Loading commit…" testid="commit-loading" />}
              {detail.kind === "ready" && <CommitDetailView detail={detail.value} />}
            </Box>
          )}
          {tab === "diff" && (
            <DiffPane
              diff={diff}
              busy={busy}
              file={at}
              options={diffOpts}
              onOptions={setDiffOpts}
              onRetry={reload}
              onOpenDifftool={openDifftool}
            />
          )}
          {tab === "view" &&
            (blob.kind === "error" ? (
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <ErrorState message={blob.message} onRetry={reload} testid="blob-error" />
              </Box>
            ) : (
              <BlobPane
                blob={blob.kind === "ready" ? blob.value : null}
                path={at}
                onRetry={reload}
                onOpenDifftool={openDifftool}
              />
            ))}
        </Box>
      </Paper>
    </Box>
  )
}

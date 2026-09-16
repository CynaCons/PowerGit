import Box from "@mui/material/Box"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { BottomPanel } from "./components/BottomPanel"
import { CommandBar } from "./components/CommandBar"
import { AppDialogs } from "./components/dialogs/AppDialogs"
import { ErrorBanner } from "./components/ErrorBanner"
import { FileHistoryView } from "./components/FileHistoryView"
import { GitConsole } from "./components/GitConsole"
import { openConsoleTab, toggleGitConsole } from "./components/gitConsoleState"
import { CollapsedLeftPanel, HistoryPane } from "./components/HistoryPane"
import { JobPanel } from "./components/JobPanel"
import { NavRail } from "./components/NavRail"
import { OperationBanner } from "./components/OperationBanner"
import { PanelSplitter } from "./components/PanelSplitter"
import { RecoveryPanel } from "./components/RecoveryPanel"
import { RepoTree } from "./components/RepoTree"
import { SettingsView } from "./components/settings/SettingsView"
import { StatusBar } from "./components/StatusBar"
import { EngineProvider, type EngineClient } from "./engine"
import { focusGrid } from "./hooks/focusGrid"
import { useChromeLayout } from "./hooks/useChromeLayout"
import { useDialogs } from "./hooks/useDialogs"
import { useFileHistory } from "./hooks/useFileHistory"
import { useGraphFilterChip, useGraphRefFilter } from "./hooks/useGraphRefFilter"
import { useGraphNav } from "./hooks/useGraphNav"
import { useGridMenus } from "./hooks/useGridMenus"
import { useEngineSession } from "./hooks/useEngineSession"
import { useGitActions } from "./hooks/useGitActions"
import { useHistory } from "./hooks/useHistory"
import { useJobs } from "./hooks/useJobs"
import { useRepoState } from "./hooks/useRepoState"
import { useSettingsPage } from "./hooks/useSettingsPage"
import { useZoomHotkeys } from "./hooks/useZoomHotkeys"
import { useStable } from "./hooks/useStable"
import { useStatusNote } from "./hooks/useStatusNote"
import { prefetchCommit } from "./engine/commitCache"
import { useHotkeyLayer, type CommandId } from "./hotkeys"
import { useBarLayout } from "./theme/barLayout"
import { TitleStrip } from "./components/TitleStrip"
import { CommandRail } from "./components/CommandRail"
import { IncidentBanner } from "./components/IncidentBanner"
import { SnapshotDialog } from "./components/SnapshotDialog"
import { withArtificialRows } from "./graph/artificial"
import { findRefTarget } from "./components/refChipsModel"
import { useAutoFetch } from "./hooks/useAutoFetch"
import { useDiagnosticSnapshot } from "./hooks/useDiagnosticSnapshot"
import { useHeartbeat } from "./hooks/useHeartbeat"

// Composition only: the hooks own the state, the components own the pixels,
// and this file wires them together plus the browse-scope hotkeys. `base`
// is the repo-less engine client resolved once at boot (main.tsx); the
// session derives the repo-bound one every component reads via useEngine().
export default function App({ base }: { base: EngineClient }) {
  const session = useEngineSession(base)
  const { view, state, client, engineError, setEngineError, recents, forgetRecent, demo } = session
  const { live, offline, repo } = view
  // Which refs the graph shows (v0.18.5): the tree's ticks, per repository.
  const graphFilter = useGraphRefFilter(client.repoId)
  const history = useHistory({
    client,
    demo,
    live,
    setEngineError,
    onFailure: session.handleFailure,
    filter: graphFilter.filter,
  })
  const { rows: engineRows, selectedSha, setSelectedSha, loadingTail, loaded, historyNote } = history
  const repoState = useRepoState({ session, history })
  const { refs, status, stashes, refresh, refreshing, openFolder, remoteNames, defaultRemote, dirty } = repoState
  const filterChip = useGraphFilterChip(graphFilter, { client, live, refs, history })
  // Pending changes as rows on top of HEAD (v0.14.1): injected after layout,
  // so the engine rows and the worker's append path stay untouched. Selection
  // is resolved here so a pending row can be the current one.
  const unstagedCount = status?.unstagedCount ?? 0
  const stagedCount = status?.stagedCount ?? 0
  const rows = useMemo(
    () => withArtificialRows(engineRows, status ? { unstagedCount, stagedCount } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engineRows, status !== null, unstagedCount, stagedCount],
  )
  const selected = useMemo(() => {
    const i = selectedSha ? rows.findIndex((r) => r.rev.id === selectedSha) : -1
    return i >= 0 ? i : rows.length > 0 ? 0 : -1
  }, [rows, selectedSha])
  const current = selected >= 0 ? rows[selected] : undefined
  const headId = useMemo(() => engineRows.find((r) => r.isHead)?.rev.id ?? null, [engineRows])
  useHeartbeat()
  useZoomHotkeys()
  // Tag chips on graph rows get a tag glyph (v0.14.0, owner: "tags should
  // be having a different little icon"); names come from the ref tree.
  const tagNames = useMemo(() => (refs?.tags ?? []).map((t) => t.name), [refs])
  const jobs = useJobs({
    client,
    dispatch: session.dispatch,
    busy: view.busy,
    setEngineError,
    refresh,
    handleFailure: session.handleFailure,
  })
  const { busy, jobLabel, runJob } = jobs
  // Background fetch on the interval from Settings, Behaviour (v0.15.0).
  useAutoFetch({ client, live, busy, status, defaultRemote, refresh })
  const dialogs = useDialogs()
  const { open, hotkeysEnabled } = dialogs
  // Git Extensions' FormFileHistory, shown in place of the graph and panel
  // (v0.16.0); the main history's state stays here while it is open.
  const fileHistory = useFileHistory()
  // Settings is a page over the same area (v0.18.0); the gear toggles it.
  const settings = useSettingsPage()
  // useGitActions rebuilds its closures every render; hand memoised children
  // stable identities so a row click re-renders only the grid and, deferred,
  // the bottom panel (owner report: "clicking commits feels laggy").
  // The status bar's transient line ("Saved 0001-….patch", v0.18.6): the
  // next row selection clears it, or it fades on its own.
  const notes = useStatusNote()
  const { clearNote } = notes
  useEffect(() => clearNote(), [clearNote, selectedSha])
  const actions = useStable(useGitActions({ session, history, repoState, jobs, dialogs, notes }))
  // The compass and its chords (v0.18.12); the file history has neither.
  const nav = useGraphNav({ rows, current, history, notes, refs, repo, graphFilter, client, fileHistory, dialogs })
  const layout = useChromeLayout()
  const { bottomHeight, leftOpen, setLeftOpen, bottomTab, setBottomTab, contentRef, splitter } = layout
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  // Owner (v0.14.1): "dump all the information that we need in a file or
  // package, and I'll bring it back to you".
  const { snapshot, takeDiagnosticSnapshot, closeSnapshot } = useDiagnosticSnapshot({
    client,
    version: view.health?.engine ?? null,
    phase: state.phase,
    repo,
    rowCount: rows.length,
    selectedSha: current?.rev.id ?? null,
  })
  const railBar = useBarLayout() === "rail"
  // The highlight must land in the click's own frame; commit details, files
  // and diff follow in a deferred render and load asynchronously.
  const deferredCurrent = useDeferredValue(current)
  // Ask the engine as soon as the selection has committed (before the
  // deferred bottom-panel render), so details and the first diff are in
  // flight while React renders the panel; the panel finds the promises in
  // engine/commitCache. Not in the click handler itself: a response landing
  // mid-render interrupts the deferred render and costs more than it saves.
  useEffect(() => {
    prefetchCommit(client, current?.rev.id ?? null)
  }, [client, current])
  const chrome = useStable({
    refresh: () => refresh().catch(() => undefined),
    openStash: () => open({ kind: "stash" }),
    openRepo: () => void openFolder(),
    openRecents: () => open({ kind: "recents" }),
    openSettings: settings.toggle,
    openSnapshot: () => void takeDiagnosticSnapshot(),
    selectTarget: (sha: string) => void history.jumpToRef(sha),
    // A ref chip in the Commit tab (v0.18.3): the tree's click, by name.
    selectRef: (name: string) => {
      const sha = findRefTarget(refs, name)
      if (sha) void history.jumpToRef(sha)
    },
    collapseLeft: () => setLeftOpen(false),
    expandLeft: () => setLeftOpen(true),
    checkoutRef: (name: string) => void actions.checkout(name, false),
    configureRemote: (name: string) => open({ kind: "remoteConfig", remote: name }),
    mergeRef: (name: string) => actions.openMerge(name),
    rebaseOnto: (name: string) => open({ kind: "rebase", onto: name }),
    closeFileHistory: () => {
      fileHistory.close()
      focusGrid()
    },
  })
  // Row and ref-chip menus, shared by the main grid and the file history's.
  const menus = useGridMenus(open, repo?.branch)

  const progressLabel = jobLabel !== null ? `${jobLabel}…` : historyNote

  useHotkeyLayer(
    "browse",
    {
      "browse.commit": actions.openCommit,
      "browse.openRepo": () => void openFolder(),
      "browse.openSettings": settings.toggle,
      "browse.createBranch": actions.openCreateBranch,
      "browse.createTag": actions.openCreateTag,
      "browse.checkoutBranch": actions.openCheckoutBranch,
      "browse.rebase": actions.openRebase,
      "browse.mergeBranch": actions.openMergeBranch,
      "browse.pull": () => {
        if (live && !busy) jobs.openPreview("pull")
      },
      "browse.push": () => {
        if (live && !busy) jobs.openPreview("push")
      },
      "browse.quickFetch": () => {
        if (live && !busy) void runJob(`Fetching ${defaultRemote}`, () => client.startFetch(defaultRemote))
      },
      "browse.quickPull": () => {
        if (live && !busy) void runJob("Pulling", () => client.startPull(false))
      },
      "browse.quickPush": () => {
        if (live && !busy) void runJob("Pushing", () => client.startPush(false))
      },
      "browse.quickPullOrFetch": () => {
        if (live && !busy) void runJob("Pulling", () => client.startPull(false))
      },
      "browse.stash": () => {
        if (live) open({ kind: "stash" })
      },
      "browse.stashPop": () => {
        if (!live || stashes.length === 0) return
        actions.applyLatestStash(true)
      },
      "browse.toggleLeftPanel": () => setLeftOpen((o) => !o),
      "browse.focusLeftPanel": () => {
        if (!leftOpen) setLeftOpen(true)
        requestAnimationFrame(() => {
          ;(document.querySelector('[data-testid="tree-filter"]') as HTMLElement | null)?.focus()
        })
      },
      "browse.focusRevisionGrid": focusGrid,
      "browse.focusCommitInfo": () => setBottomTab(0),
      "browse.focusDiff": () => setBottomTab(1),
      "browse.focusFileTree": () => setBottomTab(2),
      "browse.focusNextTab": () => setBottomTab((t) => (t + 1) % 3),
      "browse.focusPrevTab": () => setBottomTab((t) => (t + 2) % 3),
      "browse.refresh": () => {
        if (live) void refresh().catch(() => undefined)
      },
      "browse.gitConsole": () => toggleGitConsole(),
      "browse.appLog": () => openConsoleTab("app"),
      "browse.fileHistory": () => fileHistory.openSelected(current?.rev.id),
      // Ctrl+Shift+B (v0.18.4). The file history's grid has its own root and
      // no menu item for it (GE's FormFileHistory has none): pass the key on.
      "browse.highlightAncestry": () => (fileHistory.target ? false : history.toggleHighlightRoot(current?.rev.id)),
    } satisfies Partial<Record<CommandId, () => void>>,
    hotkeysEnabled,
  )

  return (
    <EngineProvider base={base} repo={client}>
      <Box
        data-testid="browse-shell"
        sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "background.default" }}
      >
        {railBar && (
          <TitleStrip
            repoName={repo?.name}
            booting={view.booting || (live && !demo && !loaded && !offline)}
            busyLabel={busy ? jobLabel : null}
          />
        )}
        {!railBar && (
          <CommandBar
            toolbarRef={layout.toolbarRef}
            tier={layout.toolbarTier}
            live={live}
            dirty={dirty}
            operation={status?.state ?? "none"}
            stashCount={stashes.length}
            hasCurrent={current !== undefined}
            remoteNames={remoteNames}
            defaultRemote={defaultRemote}
            booting={view.booting || (live && !demo && !loaded && !offline)}
            jobs={jobs}
            actions={actions}
            refresh={chrome.refresh}
            openStash={chrome.openStash}
          />
        )}
        <IncidentBanner />
        {engineError && <ErrorBanner message={engineError} onDismiss={() => setEngineError(null)} />}
        {/* A stopped merge/rebase is a state, not an error: its exits sit
            directly under the error banner, above the graph (v0.15.0). */}
        <OperationBanner
          status={status}
          busy={busy}
          onResolve={actions.openResolveConflicts}
          onContinue={() => void actions.continueOperation()}
          onSkip={() => void actions.skipOperation()}
          onAbort={actions.abortOperation}
        />

        <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
          {railBar ? (
            <CommandRail
              repoName={repo?.name}
              onOpenRepo={chrome.openRepo}
              onRecents={chrome.openRecents}
              onSettings={chrome.openSettings}
              settingsOpen={settings.open}
              onSnapshot={chrome.openSnapshot}
              live={live}
              dirty={dirty}
              operation={status?.state ?? "none"}
              stashCount={stashes.length}
              hasCurrent={current !== undefined}
              remoteNames={remoteNames}
              defaultRemote={defaultRemote}
              jobs={jobs}
              actions={actions}
              refresh={chrome.refresh}
              openStash={chrome.openStash}
            />
          ) : (
            <NavRail
              repoName={repo?.name}
              onOpenRepo={chrome.openRepo}
              onRecents={chrome.openRecents}
              onSettings={chrome.openSettings}
              settingsOpen={settings.open}
              onSnapshot={chrome.openSnapshot}
            />
          )}

          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Box ref={contentRef} sx={{ flex: 1, minHeight: 0, display: "flex" }}>
              {settings.open ? (
                <SettingsView onClose={settings.close} />
              ) : leftOpen ? (
                <RepoTree
                  tree={refs}
                  repoId={client.repoId}
                  onSelectTarget={chrome.selectTarget}
                  onCollapse={chrome.collapseLeft}
                  onCheckoutRef={chrome.checkoutRef}
                  onDeleteBranch={actions.removeBranch}
                  onDeleteTag={actions.removeTag}
                  onFetchRemote={actions.fetchRemote}
                  onConfigureRemote={chrome.configureRemote}
                  onOpenSubmodule={actions.openSubmodule}
                  onMergeRef={chrome.mergeRef}
                  onRebaseOnto={chrome.rebaseOnto}
                />
              ) : (
                <CollapsedLeftPanel onExpand={chrome.expandLeft} />
              )}
              {!settings.open && (
                <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", position: "relative" }}>
                  {fileHistory.target ? (
                    <FileHistoryView
                      target={fileHistory.target}
                      session={session}
                      repoState={repoState}
                      layout={layout}
                      menus={menus}
                      remoteNames={remoteNames}
                      tagNames={tagNames}
                      headId={headId}
                      onSavePatch={(row) => void actions.savePatch(row)}
                      onClose={chrome.closeFileHistory}
                    />
                  ) : (
                    <>
                      <HistoryPane
                        rows={rows}
                        remoteNames={remoteNames}
                        tagNames={tagNames}
                        currentBranch={repo?.branch}
                        highlightRoot={history.highlightRoot}
                        onHighlightRoot={history.setHighlightRoot}
                        selected={selected}
                        loadingTail={loadingTail}
                        loading={live && !demo && !loaded}
                        engineError={engineError}
                        view={view}
                        headerExtra={filterChip}
                        nav={nav}
                        onSelect={(i) => setSelectedSha(rows[i]?.rev.id ?? null)}
                        onNearEnd={history.onNearEnd}
                        menus={menus}
                        selectedSha={selectedSha}
                        onRetry={() => void refresh().catch(() => undefined)}
                        onOpenRepo={() => void openFolder()}
                        onRecover={() => setRecoveryOpen(true)}
                      />
                      <PanelSplitter testid="panel-splitter" splitter={splitter} />
                      <BottomPanel
                        current={deferredCurrent}
                        status={status}
                        headId={headId}
                        onOpenCommit={actions.openCommit}
                        height={bottomHeight}
                        tab={bottomTab}
                        onTab={setBottomTab}
                        setStatus={repoState.setStatus}
                        onFileHistory={fileHistory.open}
                        onSelectedFile={fileHistory.setBrowseFile}
                        tagNames={tagNames}
                        remoteNames={remoteNames}
                        onSelectRef={chrome.selectRef}
                        menus={menus}
                      />
                    </>
                  )}
                </Box>
              )}
            </Box>
          </Box>
        </Box>
        <StatusBar
          view={view}
          status={status}
          dirty={dirty}
          refreshing={refreshing && loaded}
          progressLabel={progressLabel}
          note={notes.note}
          onOpenJobs={() => jobs.setPanelOpen(true)}
          onOpenRecovery={() => setRecoveryOpen(true)}
        />
        {/* Last row of the column: the panel shortens the graph instead of
            covering it, and neither it nor the dock line ever sits over the
            status bar. It mounts the failure card too (same buffer). */}
        <GitConsole client={client} live={live} />

        <AppDialogs
          dialogs={dialogs}
          actions={actions}
          repo={repo}
          recents={recents}
          onForgetRecent={forgetRecent}
          repoState={repoState}
          jobs={jobs}
          onFileHistory={fileHistory.open}
        />
        <JobPanel jobs={jobs} onClose={() => jobs.setPanelOpen(false)} />
        <SnapshotDialog state={snapshot} onClose={closeSnapshot} />
        <RecoveryPanel
          open={recoveryOpen || (state.phase === "engine-failed" && !demo)}
          phase={state}
          view={view}
          onClose={() => setRecoveryOpen(false)}
          onRetry={() => {
            setRecoveryOpen(false)
            session.retry()
          }}
          onOpenRepository={() => {
            setRecoveryOpen(false)
            void openFolder()
          }}
        />
      </Box>
    </EngineProvider>
  )
}

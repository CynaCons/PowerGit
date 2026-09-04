import Box from "@mui/material/Box"
import { useState } from "react"
import { BottomPanel } from "./components/BottomPanel"
import { CommandBar } from "./components/CommandBar"
import { AppDialogs } from "./components/dialogs/AppDialogs"
import { ErrorBanner } from "./components/ErrorBanner"
import { CollapsedLeftPanel, HistoryPane } from "./components/HistoryPane"
import { JobPanel } from "./components/JobPanel"
import { NavRail } from "./components/NavRail"
import { RecoveryPanel } from "./components/RecoveryPanel"
import { RepoTree } from "./components/RepoTree"
import { StatusBar } from "./components/StatusBar"
import { EngineProvider, type EngineClient } from "./engine"
import { focusGrid } from "./hooks/focusGrid"
import { useChromeLayout } from "./hooks/useChromeLayout"
import { useDialogs } from "./hooks/useDialogs"
import { useEngineSession } from "./hooks/useEngineSession"
import { useGitActions } from "./hooks/useGitActions"
import { useHistory } from "./hooks/useHistory"
import { useJobs } from "./hooks/useJobs"
import { useRepoState } from "./hooks/useRepoState"
import { useHotkeyLayer, type CommandId } from "./hotkeys"

// Composition only: the hooks own the state, the components own the pixels,
// and this file wires them together plus the browse-scope hotkeys. `base`
// is the repo-less engine client resolved once at boot (main.tsx); the
// session derives the repo-bound one every component reads via useEngine().
export default function App({ base }: { base: EngineClient }) {
  const session = useEngineSession(base)
  const { view, state, client, engineError, setEngineError, recents, demo } = session
  const { live, offline, repo } = view
  const history = useHistory({ client, demo, live, setEngineError, onFailure: session.handleFailure })
  const { rows, selected, current, setSelectedSha, loadingTail, loaded, historyNote } = history
  const repoState = useRepoState({ session, history })
  const { refs, status, stashes, refresh, refreshing, openFolder, remoteNames, defaultRemote, dirty } = repoState
  const jobs = useJobs({
    client,
    dispatch: session.dispatch,
    busy: view.busy,
    setEngineError,
    refresh,
    handleFailure: session.handleFailure,
  })
  const { busy, jobLabel, runJob } = jobs
  const dialogs = useDialogs()
  const { open, hotkeysEnabled } = dialogs
  const actions = useGitActions({ session, history, repoState, jobs, dialogs })
  const layout = useChromeLayout()
  const { bottomHeight, leftOpen, setLeftOpen, bottomTab, setBottomTab, contentRef, splitter } = layout
  const [recoveryOpen, setRecoveryOpen] = useState(false)

  const progressLabel = jobLabel !== null ? `${jobLabel}…` : historyNote

  useHotkeyLayer(
    "browse",
    {
      "browse.commit": actions.openCommit,
      "browse.openRepo": () => void openFolder(),
      "browse.openSettings": () => open({ kind: "settings" }),
      "browse.createBranch": actions.openCreateBranch,
      "browse.createTag": actions.openCreateTag,
      "browse.checkoutBranch": actions.openCheckoutBranch,
      "browse.rebase": actions.openRebase,
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
      "browse.focusRevisionGrid": () => {
        focusGrid()
      },
      "browse.focusCommitInfo": () => setBottomTab(0),
      "browse.focusDiff": () => setBottomTab(1),
      "browse.focusFileTree": () => setBottomTab(2),
      "browse.focusNextTab": () => setBottomTab((t) => (t + 1) % 3),
      "browse.focusPrevTab": () => setBottomTab((t) => (t + 2) % 3),
      "browse.refresh": () => {
        if (live) void refresh().catch(() => undefined)
      },
    } satisfies Partial<Record<CommandId, () => void>>,
    hotkeysEnabled,
  )

  return (
    <EngineProvider base={base} repo={client}>
      <Box
        data-testid="browse-shell"
        sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "background.default" }}
      >
        <CommandBar
          toolbarRef={layout.toolbarRef}
          tier={layout.toolbarTier}
          live={live}
          dirty={dirty}
          stashCount={stashes.length}
          hasCurrent={current !== undefined}
          remoteNames={remoteNames}
          defaultRemote={defaultRemote}
          booting={view.booting || (live && !demo && !loaded && !offline)}
          jobs={jobs}
          actions={actions}
          refresh={() => refresh().catch(() => undefined)}
          openStash={() => open({ kind: "stash" })}
        />
        {engineError && <ErrorBanner message={engineError} onDismiss={() => setEngineError(null)} />}

        <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
          <NavRail
            repoName={repo?.name}
            onOpenRepo={() => void openFolder()}
            onRecents={() => open({ kind: "recents" })}
            onSettings={() => open({ kind: "settings" })}
          />

          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <Box ref={contentRef} sx={{ flex: 1, minHeight: 0, p: 0.75, display: "flex", gap: 0.75 }}>
              {leftOpen ? (
                <RepoTree
                  tree={refs}
                  onSelectTarget={(sha) => void history.jumpToRef(sha)}
                  onCollapse={() => setLeftOpen(false)}
                  onCheckoutRef={(name) => void actions.checkout(name, false)}
                  onDeleteBranch={actions.removeBranch}
                  onDeleteTag={actions.removeTag}
                  onFetchRemote={actions.fetchRemote}
                  onConfigureRemote={(name) => open({ kind: "remoteConfig", remote: name })}
                  onOpenSubmodule={actions.openSubmodule}
                />
              ) : (
                <CollapsedLeftPanel onExpand={() => setLeftOpen(true)} />
              )}
              <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0.5 }}>
                <HistoryPane
                  rows={rows}
                  selected={selected}
                  loadingTail={loadingTail}
                  loading={live && !demo && !loaded}
                  engineError={engineError}
                  view={view}
                  onSelect={(i) => setSelectedSha(rows[i]?.rev.id ?? null)}
                  onNearEnd={history.onNearEnd}
                  onRowContextMenu={(e, index) => {
                    e.preventDefault()
                    open({ kind: "context", target: { x: e.clientX, y: e.clientY, row: rows[index] } })
                  }}
                  onRetry={() => void refresh().catch(() => undefined)}
                  onOpenRepo={() => void openFolder()}
                  onRecover={() => setRecoveryOpen(true)}
                />
                <Box
                  data-testid="panel-splitter"
                  onPointerDown={splitter.onDividerDown}
                  onPointerMove={splitter.onDividerMove}
                  onPointerUp={splitter.onDividerUp}
                  // A GTK focus steal mid-drag fires pointercancel, never
                  // pointerup; without these the handle stays stuck to the cursor.
                  onPointerCancel={splitter.onDividerUp}
                  onLostPointerCapture={splitter.onDividerUp}
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize bottom panel"
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
        <StatusBar
          view={view}
          status={status}
          dirty={dirty}
          refreshing={refreshing && loaded}
          progressLabel={progressLabel}
          onOpenJobs={() => jobs.setPanelOpen(true)}
          onOpenRecovery={() => setRecoveryOpen(true)}
        />

        <AppDialogs
          dialogs={dialogs}
          actions={actions}
          repo={repo}
          recents={recents}
          repoState={repoState}
          jobs={jobs}
        />
        <JobPanel jobs={jobs} onClose={() => jobs.setPanelOpen(false)} />
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

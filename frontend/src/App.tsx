import Box from "@mui/material/Box"
import { BottomPanel } from "./components/BottomPanel"
import { CommandBar } from "./components/CommandBar"
import { AppDialogs } from "./components/dialogs/AppDialogs"
import { ErrorBanner } from "./components/ErrorBanner"
import { CollapsedLeftPanel, HistoryPane } from "./components/HistoryPane"
import { NavRail } from "./components/NavRail"
import { RepoTree } from "./components/RepoTree"
import { StatusBar } from "./components/StatusBar"
import { startFetch, startPull, startPush } from "./engine"
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
// and this file wires them together plus the browse-scope hotkeys.
export default function App() {
  const session = useEngineSession()
  const { offline, live, health, repo, engineError, setEngineError, recents } = session
  const history = useHistory({ offline, live, setLive: session.setLive, setEngineError })
  const { rows, selected, current, setSelectedSha, loadingTail, historyNote } = history
  const repoState = useRepoState({ session, history })
  const { refs, status, stashes, refresh, openFolder, remoteNames, defaultRemote, dirty } = repoState
  const jobs = useJobs({ setEngineError, refresh })
  const { busy, jobLabel, runJob } = jobs
  const dialogs = useDialogs()
  const { open, hotkeysEnabled } = dialogs
  const actions = useGitActions({ session, history, repoState, jobs, dialogs })
  const layout = useChromeLayout()
  const { bottomHeight, leftOpen, setLeftOpen, bottomTab, setBottomTab, contentRef, splitter } = layout

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
        if (live) void refresh()
      },
    } satisfies Partial<Record<CommandId, () => void>>,
    hotkeysEnabled,
  )

  return (
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
        booting={!live && !offline && health !== null}
        jobs={jobs}
        actions={actions}
        refresh={refresh}
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
                engineError={engineError}
                hasRepo={repo !== null}
                onSelect={(i) => setSelectedSha(rows[i]?.rev.id ?? null)}
                onNearEnd={history.onNearEnd}
                onRowContextMenu={(e, index) => {
                  e.preventDefault()
                  open({ kind: "context", target: { x: e.clientX, y: e.clientY, row: rows[index] } })
                }}
                onRetry={() => void refresh()}
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
        live={live}
        offline={offline}
        repo={repo}
        status={status}
        health={health}
        dirty={dirty}
        progressLabel={progressLabel}
      />

      <AppDialogs dialogs={dialogs} actions={actions} repo={repo} recents={recents} repoState={repoState} />
    </Box>
  )
}

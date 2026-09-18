import type { Dispatch, SetStateAction } from "react"
import { openConsoleTab, toggleGitConsole } from "../components/gitConsoleState"
import type { EngineClient } from "../engine"
import { useHotkeyLayer, type CommandId } from "../hotkeys"
import { focusGrid } from "./focusGrid"
import type { useDialogs } from "./useDialogs"
import type { useFileHistory } from "./useFileHistory"
import type { useGitActions } from "./useGitActions"
import type { useHistory } from "./useHistory"
import type { useJobs } from "./useJobs"
import type { useSettingsPage } from "./useSettingsPage"

type BrowseHotkeyDeps = {
  actions: ReturnType<typeof useGitActions>
  openFolder: () => Promise<unknown>
  settings: ReturnType<typeof useSettingsPage>
  live: boolean
  busy: boolean
  jobs: ReturnType<typeof useJobs>
  defaultRemote: string
  client: EngineClient
  open: ReturnType<typeof useDialogs>["open"]
  stashes: readonly unknown[]
  leftOpen: boolean
  setLeftOpen: Dispatch<SetStateAction<boolean>>
  setBottomTab: Dispatch<SetStateAction<number>>
  refresh: () => Promise<unknown>
  fileHistory: ReturnType<typeof useFileHistory>
  current: { rev: { id: string } } | undefined
  history: ReturnType<typeof useHistory>
  hotkeysEnabled: boolean
}

// The browse-scope hotkey map, out of App.tsx (v0.18.19: the file crossed
// the max-lines tripwire with the v0.18.18 prettier pass). Same entries,
// same closures; App hands over what they read.
export function useBrowseHotkeys(d: BrowseHotkeyDeps): void {
  const { actions, live, busy, jobs, client, defaultRemote, open, fileHistory, history, current } = d
  const { runJob } = jobs
  useHotkeyLayer(
    "browse",
    {
      "browse.commit": actions.openCommit,
      "browse.openRepo": () => void d.openFolder(),
      "browse.openSettings": d.settings.toggle,
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
        if (!live || d.stashes.length === 0) return
        actions.applyLatestStash(true)
      },
      "browse.toggleLeftPanel": () => d.setLeftOpen((o) => !o),
      "browse.focusLeftPanel": () => {
        if (!d.leftOpen) d.setLeftOpen(true)
        requestAnimationFrame(() => {
          ;(document.querySelector('[data-testid="tree-filter"]') as HTMLElement | null)?.focus()
        })
      },
      "browse.focusRevisionGrid": focusGrid,
      "browse.focusCommitInfo": () => d.setBottomTab(0),
      "browse.focusDiff": () => d.setBottomTab(1),
      "browse.focusFileTree": () => d.setBottomTab(2),
      "browse.focusNextTab": () => d.setBottomTab((t) => (t + 1) % 3),
      "browse.focusPrevTab": () => d.setBottomTab((t) => (t + 2) % 3),
      "browse.refresh": () => {
        if (live) void d.refresh().catch(() => undefined)
      },
      "browse.gitConsole": () => toggleGitConsole(),
      "browse.appLog": () => openConsoleTab("app"),
      "browse.fileHistory": () => fileHistory.openSelected(current?.rev.id),
      // Ctrl+Shift+B (v0.18.4). The file history's grid has its own root and
      // no menu item for it (GE's FormFileHistory has none): pass the key on.
      "browse.highlightAncestry": () => (fileHistory.target ? false : history.toggleHighlightRoot(current?.rev.id)),
    } satisfies Partial<Record<CommandId, () => void>>,
    d.hotkeysEnabled,
  )
}

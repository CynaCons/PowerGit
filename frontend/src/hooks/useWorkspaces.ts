import { useEffect, useMemo, useState } from "react"
import { useEngineBase, type RecentInfo, type WorkspaceInfo } from "../engine"
import { fallbackWorkspaces, withRecents } from "../components/workspaceCards"

/**
 * The start pane's repositories with all their worktrees (v0.20.10, GET
 * /repos/workspaces), read again whenever the recents change — an open, a
 * pin, a removal. Until the first answer, and from an engine without the
 * route, each recent repository is a card of one. Pins and last-opened times
 * come from the recents list, which changes at once on a click; the
 * workspaces answer follows a moment later and would otherwise hand a second
 * click on the star the old state.
 */
export function useWorkspaces(recents: RecentInfo[]): WorkspaceInfo[] {
  const engine = useEngineBase()
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[] | null>(null)
  const key = recents.map((r) => `${r.root}\u0001${r.lastOpened ?? ""}\u0001${r.pinned ? 1 : 0}`).join("\0")
  useEffect(() => {
    const controller = new AbortController()
    engine
      .workspaces(controller.signal)
      .then(setWorkspaces)
      .catch(() => {
        if (!controller.signal.aborted) setWorkspaces(null)
      })
    return () => controller.abort()
    // key stands for the recents list without depending on its array identity.
  }, [engine, key])
  return useMemo(
    () => (workspaces ? withRecents(workspaces, recents) : fallbackWorkspaces(recents)),
    [workspaces, recents],
  )
}

import { useCallback } from "react"
import { useEngineBase, type RecentInfo } from "../engine"
import type { useEngineSession } from "../hooks/useEngineSession"
import { useRecentsPeek } from "../hooks/useRecentsPeek"
import type { RepoState } from "../hooks/useRepoState"
import { isTauriShell } from "../shell"
import { copyToClipboard } from "./clipboard"
import { StartPane } from "./StartPane"
import { useSelectedRoot } from "./useSelectedRoot"

type Props = {
  session: ReturnType<typeof useEngineSession>
  repoState: Pick<RepoState, "openFolder">
  onClose: () => void
}

// Everything the pane needs from the app, so the pane itself stays a
// component that takes props and calls back: the peeks for the list and for
// the selection, the pin that writes through to recents.json, the clipboard,
// and "Terminal here" — a shell command, so it does nothing in the browser
// the e2e suite drives.
export function StartPaneView({ session, repoState, onClose }: Props) {
  const engine = useEngineBase()
  const { recents, setRecents, forgetRecent } = session
  const currentRoot = session.view.repo?.root ?? null
  const [root, setRoot] = useSelectedRoot(recents, currentRoot)
  const { peeks, detail } = useRecentsPeek(recents, root)

  const pin = useCallback(
    (target: string, pinned: boolean) => {
      // The star answers at once and the list is re-read afterwards: the
      // order the engine returns is the one that must win.
      setRecents(recents.map((r: RecentInfo) => (r.root === target ? { ...r, pinned } : r)))
      void engine
        .pinRecent(target, pinned)
        .then(() => engine.recents())
        .then(setRecents)
        .catch(() => undefined)
    },
    [engine, recents, setRecents],
  )

  const terminal = useCallback((target: string) => {
    if (!isTauriShell()) return
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("open_terminal", { path: target }))
      .catch(() => undefined)
  }, [])

  return (
    <StartPane
      recents={recents}
      peeks={peeks}
      detail={detail}
      currentRoot={currentRoot}
      onSelect={setRoot}
      onOpen={(target) => {
        // Picking one is leaving the pane, as picking a tile closed the
        // dialog. The pane is already gone while the repository loads.
        onClose()
        void repoState.openFolder(target)
      }}
      onForget={forgetRecent}
      onPin={pin}
      onOpenFolder={() => void repoState.openFolder()}
      onTerminal={terminal}
      onCopyPath={(target) => void copyToClipboard(target)}
      onClose={onClose}
    />
  )
}

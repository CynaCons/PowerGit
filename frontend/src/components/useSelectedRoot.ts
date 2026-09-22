import { useEffect, useState } from "react"
import type { RecentInfo } from "../engine"

/**
 * Which repository the start pane is previewing. It follows the cursor, but
 * it has to start somewhere: the one that is open now if it is in the list,
 * otherwise the first entry — and it must not stay pointing at a root the
 * list no longer has (Delete removed it, or the engine pruned it).
 */
export function useSelectedRoot(recents: RecentInfo[], currentRoot?: string | null) {
  const [root, setRoot] = useState<string | null>(null)
  useEffect(() => {
    setRoot((previous) => {
      if (previous && recents.some((r) => r.root === previous)) return previous
      if (currentRoot && recents.some((r) => r.root === currentRoot)) return currentRoot
      return recents[0]?.root ?? null
    })
  }, [recents, currentRoot])
  return [root, setRoot] as const
}

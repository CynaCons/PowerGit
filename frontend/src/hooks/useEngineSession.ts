import { useState } from "react"
import type { Health, RepoInfo } from "../engine"

export type EngineSession = ReturnType<typeof useEngineSession>

// Engine connection state: is the engine reachable (offline = demo rows),
// which repository it has open, and whether live history has loaded. The
// boot sequence that fills this in lives in useRepoState (it is the first
// refresh), so this hook stays a plain state owner every other hook can read.
export function useEngineSession() {
  // Synthetic rows are ONLY for the offline/demo case (engine unreachable).
  // While booting or loading a live repo the grid is empty — never fake data.
  const [offline, setOffline] = useState(false)
  const [health, setHealth] = useState<Health | null>(null)
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [recents, setRecents] = useState<RepoInfo[]>([])
  const [live, setLive] = useState(false)
  return {
    offline,
    setOffline,
    health,
    setHealth,
    repo,
    setRepo,
    engineError,
    setEngineError,
    recents,
    setRecents,
    live,
    setLive,
  }
}

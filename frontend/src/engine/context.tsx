import type { ReactNode } from "react"
import { EngineContext } from "./useEngine"
import type { EngineClient } from "./client"

/** Two clients: the repo-less base (health, open, recents) and the one
 *  bound to this window's repository. Components ask for the bound one; a
 *  component rendered while no repository is open gets a client whose repo
 *  helpers throw "no repository open", never one that guesses. */
export function EngineProvider({
  base,
  repo,
  children,
}: {
  base: EngineClient
  repo: EngineClient
  children: ReactNode
}) {
  return <EngineContext.Provider value={{ base, repo }}>{children}</EngineContext.Provider>
}

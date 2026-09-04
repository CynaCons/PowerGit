import { createContext, useContext } from "react"
import type { EngineClient } from "./client"

export type EngineContextValue = { base: EngineClient; repo: EngineClient }

export const EngineContext = createContext<EngineContextValue | null>(null)

/** The client bound to this window's repository. */
export function useEngine(): EngineClient {
  const ctx = useContext(EngineContext)
  if (!ctx) throw new Error("useEngine must be used inside <EngineProvider>")
  return ctx.repo
}

/** The repo-less client (health, open/list repositories). */
export function useEngineBase(): EngineClient {
  const ctx = useContext(EngineContext)
  if (!ctx) throw new Error("useEngineBase must be used inside <EngineProvider>")
  return ctx.base
}

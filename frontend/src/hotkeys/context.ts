import { createContext } from "react"
import type { Scope } from "./catalog"
import type { HandlerMap } from "./dispatch"

export type Layer = { scope: Scope; handlers: { current: HandlerMap } }

export type HotkeyApi = {
  pushLayer: (scope: Scope, handlers: { current: HandlerMap }) => () => void
}

export const HotkeyContext = createContext<HotkeyApi | null>(null)

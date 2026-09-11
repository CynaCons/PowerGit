import { useEffect, useMemo, useRef, type ReactNode } from "react"
import { isTauriShell } from "../shell"
import { HotkeyContext, type HotkeyApi, type Layer } from "./context"
import { dispatchLayers, handleHotkey, type HandlerMap } from "./dispatch"
import { fromEvent } from "./parse"
import { recoveryHandlers } from "./recovery"

export function HotkeyHost({ children }: { children: ReactNode }) {
  const stack = useRef<Layer[]>([])
  const global = useRef<HandlerMap>(recoveryHandlers())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = fromEvent(e)
      if (c.key === "F5" && !c.ctrl && !c.alt) {
        e.preventDefault()
      }
      // Global chords come first and in every phase (v0.15.6): a frozen
      // window has no layer worth protecting, and only the shell can act.
      if (isTauriShell() && handleHotkey(e, "global", global.current)) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      // Then the layers, top to bottom (v0.17.0): the first that handles
      // the key wins; one that does not — no hit, no handler, or a handler
      // that returned false — passes it down. See dispatchLayers.
      if (dispatchLayers(e, stack.current)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [])

  const api = useMemo<HotkeyApi>(
    () => ({
      pushLayer: (scope, handlers) => {
        const layer: Layer = { scope, handlers }
        stack.current.push(layer)
        return () => {
          stack.current = stack.current.filter((l) => l !== layer)
        }
      },
    }),
    [],
  )

  return <HotkeyContext.Provider value={api}>{children}</HotkeyContext.Provider>
}

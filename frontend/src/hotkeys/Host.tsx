import { useEffect, useMemo, useRef, type ReactNode } from "react"
import { HotkeyContext, type HotkeyApi, type Layer } from "./context"
import { handleHotkey } from "./dispatch"
import { fromEvent } from "./parse"

export function HotkeyHost({ children }: { children: ReactNode }) {
  const stack = useRef<Layer[]>([])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = fromEvent(e)
      if (c.key === "F5" && !c.ctrl && !c.alt) {
        e.preventDefault()
      }
      const top = stack.current[stack.current.length - 1]
      if (!top) return
      if (handleHotkey(e, top.scope, top.handlers.current)) {
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

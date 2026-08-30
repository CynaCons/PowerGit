import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react"
import type { Scope } from "./catalog"
import { handleHotkey, type HandlerMap } from "./dispatch"
import { fromEvent } from "./parse"

type Layer = { scope: Scope; handlers: { current: HandlerMap } }

type Api = {
  pushLayer: (scope: Scope, handlers: { current: HandlerMap }) => () => void
}

const HotkeyApi = createContext<Api | null>(null)

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

  const api = useMemo<Api>(
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

  return <HotkeyApi.Provider value={api}>{children}</HotkeyApi.Provider>
}

export function useHotkeyLayer(scope: Scope, handlers: HandlerMap, enabled = true) {
  const api = useContext(HotkeyApi)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  useEffect(() => {
    if (!api || !enabled) return
    return api.pushLayer(scope, handlersRef)
  }, [api, scope, enabled])
}

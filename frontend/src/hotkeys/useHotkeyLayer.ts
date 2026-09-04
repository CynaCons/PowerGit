import { useContext, useEffect, useRef } from "react"
import type { Scope } from "./catalog"
import { HotkeyContext } from "./context"
import type { HandlerMap } from "./dispatch"

export function useHotkeyLayer(scope: Scope, handlers: HandlerMap, enabled = true) {
  const api = useContext(HotkeyContext)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  useEffect(() => {
    if (!api || !enabled) return
    return api.pushLayer(scope, handlersRef)
  }, [api, scope, enabled])
}

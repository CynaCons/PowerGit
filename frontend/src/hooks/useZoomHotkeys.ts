import { useEffect } from "react"
import { zoomIn, zoomOut, zoomReset } from "../theme"

/**
 * Ctrl +/-/0 zoom (split out of App.tsx in v0.15.5, which is composition
 * only). Browser/WebView zoom is deliberately app-scoped so it never changes
 * the surrounding Tauri page or breaks portal anchoring. Handles all common
 * keyboard layouts — Ctrl+= emits "+" on some and "=" on others.
 */
export function useZoomHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      if (event.key === "+" || event.key === "=" || event.code === "Equal") {
        event.preventDefault()
        zoomIn()
      } else if (event.key === "-" || event.code === "Minus") {
        event.preventDefault()
        zoomOut()
      } else if (event.key === "0" || event.code === "Digit0" || event.code === "Numpad0") {
        event.preventDefault()
        // Zoom owns Ctrl+0; stop the hotkey layer (also on window/capture)
        // from running a second action on the same keystroke.
        event.stopImmediatePropagation()
        zoomReset()
      }
    }
    // Capture so Chromium/WebView cannot swallow Ctrl+0 as "reset browser zoom"
    // before the application handler runs.
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])
}

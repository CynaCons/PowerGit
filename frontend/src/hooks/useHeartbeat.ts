import { useEffect } from "react"
import { isTauriShell } from "../shell"

// The webview beats to the shell every 2 s (v0.14.1). When beats stop, the
// shell's watchdog writes the diagnostic snapshot the user could no longer
// ask for and records an incident for the next launch. Nothing outside the
// shell.
export const HEARTBEAT_MS = 2000

export function useHeartbeat() {
  useEffect(() => {
    if (!isTauriShell()) return
    let timer: number | undefined
    let stopped = false
    void (async () => {
      const { invoke } = await import("@tauri-apps/api/core")
      const beat = () => {
        if (stopped) return
        invoke("heartbeat").catch(() => undefined)
      }
      beat()
      timer = window.setInterval(beat, HEARTBEAT_MS)
    })()
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [])
}

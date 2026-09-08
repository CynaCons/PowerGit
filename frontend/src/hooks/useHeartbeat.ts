import { useEffect } from "react"
import { isTauriShell } from "../shell"

// The webview beats to the shell every 2 s (v0.14.1). Each beat also says
// how long ago the page last painted an animation frame (v0.14.2, owner on
// Linux: script alive, picture frozen and black). When beats stop, or beats
// arrive without frames, the shell's watchdog writes the diagnostic
// snapshot the user could no longer ask for, reloads the webview, and as a
// last resort asks natively whether to restart. Nothing outside the shell.
export const HEARTBEAT_MS = 2000

/**
 * What one beat reports: the age of the last painted frame, or null while
 * the window is hidden (frames legitimately stop then).
 */
export function frameAge(now: number, lastFrameAt: number, visible: boolean): number | null {
  return visible ? Math.max(0, now - lastFrameAt) : null
}

export function useHeartbeat() {
  useEffect(() => {
    if (!isTauriShell()) return
    let timer: number | undefined
    let stopped = false
    // One animation frame is requested per beat (not a running loop, which
    // would keep the compositor busy for nothing); the beat after it
    // reports whether it was painted.
    let lastFrameAt = performance.now()
    let framePending = false
    const onVisible = () => {
      // Coming back from hidden: frames could not fire meanwhile, give the
      // page a fresh start rather than a stale age.
      if (document.visibilityState === "visible") lastFrameAt = performance.now()
    }
    document.addEventListener("visibilitychange", onVisible)
    void (async () => {
      const { invoke } = await import("@tauri-apps/api/core")
      const beat = () => {
        if (stopped) return
        const now = performance.now()
        const visible = document.visibilityState === "visible"
        invoke("heartbeat", { frameAgeMs: frameAge(now, lastFrameAt, visible) }).catch(() => undefined)
        if (!framePending) {
          framePending = true
          window.requestAnimationFrame(() => {
            lastFrameAt = performance.now()
            framePending = false
          })
        }
      }
      beat()
      timer = window.setInterval(beat, HEARTBEAT_MS)
    })()
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])
}

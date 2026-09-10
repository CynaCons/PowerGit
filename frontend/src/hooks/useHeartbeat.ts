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

// v0.15.6 (Ubuntu freeze taskforce): a requestAnimationFrame callback does
// not prove a frame reached GTK — in non-accelerated WebKitGTK it fires
// before the toplevel is painted. So every beat also changes one pixel,
// which forces the web process to produce a real frame and hand it to the
// UI process's `draw`; the shell's paint probe counts those. 0.99 and 1 are
// visually the same but not equal, so the change is never elided.
export const PROBE_OPACITIES = ["1", "0.99"] as const

/** The opacity the probe pixel takes on the next beat. */
export function nextProbeOpacity(current: string): string {
  return current === PROBE_OPACITIES[0] ? PROBE_OPACITIES[1] : PROBE_OPACITIES[0]
}

export type ProbeElement = { style: { opacity: string } }

/** Toggles the probe pixel; returns the opacity it now has. */
export function pulseProbe(el: ProbeElement): string {
  el.style.opacity = nextProbeOpacity(el.style.opacity)
  return el.style.opacity
}

/** A fixed 1×1 px element the beat can toggle without touching layout. */
export function createProbeElement(doc: Document): HTMLElement {
  const el = doc.createElement("div")
  el.setAttribute("data-testid", "paint-probe")
  el.setAttribute("aria-hidden", "true")
  const s = el.style
  s.position = "fixed"
  s.left = "0"
  s.top = "0"
  s.width = "1px"
  s.height = "1px"
  s.pointerEvents = "none"
  s.zIndex = "2147483647"
  // Not transparent: an invisible pixel could be skipped by the compositor.
  s.background = "currentColor"
  s.opacity = PROBE_OPACITIES[0]
  return el
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
    const probe = createProbeElement(document)
    document.body.appendChild(probe)
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
        pulseProbe(probe)
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
      probe.remove()
    }
  }, [])
}

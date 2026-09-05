import Box from "@mui/material/Box"
import { useEffect, useState } from "react"
import { isTauriShell } from "../shell"

// Custom title-bar controls (v0.13.14). Owner: "merge the appbar at the top
// with the window frame itself, integrating the three system-window buttons".
// The Tauri window is created without native decorations; the command bar
// carries `data-tauri-drag-region` (drag, double-click to maximize) and
// these three buttons do what the native ones did. Glyphs follow the
// Windows 11 caption buttons (1px strokes, 46px wide targets, red close
// hover); GNOME users get the same, which is what most CSD apps do.
// Rendered only inside the Tauri shell; the browser/e2e build has a normal
// window and never shows them.

type Win = {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onResized: (cb: () => void) => Promise<() => void>
}

async function currentWindow(): Promise<Win> {
  const mod = await import("@tauri-apps/api/window")
  return mod.getCurrentWindow() as unknown as Win
}

const buttonSx = {
  width: 46,
  height: "100%",
  display: "grid",
  placeItems: "center",
  color: "text.primary",
  cursor: "default",
  border: 0,
  background: "transparent",
  padding: 0,
  "&:hover": { bgcolor: "action.hover" },
  "&:focus-visible": { outline: "1px solid", outlineColor: "primary.main", outlineOffset: -1 },
} as const

export function WindowControls() {
  const [shell] = useState(isTauriShell)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!shell) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    void currentWindow().then(async (w) => {
      const sync = () => void w.isMaximized().then((m) => !cancelled && setMaximized(m))
      sync()
      unlisten = await w.onResized(sync)
      if (cancelled) unlisten()
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [shell])

  if (!shell) return null
  const call = (action: (w: Win) => Promise<void>) => () => void currentWindow().then(action)
  return (
    <Box data-testid="window-controls" sx={{ display: "flex", alignSelf: "stretch", ml: 1, "& button": buttonSx }}>
      <Box
        component="button"
        type="button"
        aria-label="Minimize"
        data-testid="win-minimize"
        onClick={call((w) => w.minimize())}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </Box>
      <Box
        component="button"
        type="button"
        aria-label={maximized ? "Restore" : "Maximize"}
        data-testid="win-maximize"
        onClick={call((w) => w.toggleMaximize())}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2.5 0.5h7v7" fill="none" stroke="currentColor" strokeWidth="1" />
            <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </Box>
      <Box
        component="button"
        type="button"
        aria-label="Close"
        data-testid="win-close"
        onClick={call((w) => w.close())}
        sx={{ "&:hover": { bgcolor: "#c42b1c", color: "#fff" } }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1" />
        </svg>
      </Box>
    </Box>
  )
}

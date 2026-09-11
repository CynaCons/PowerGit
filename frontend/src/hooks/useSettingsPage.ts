import { useCallback, useState } from "react"
import { focusGrid } from "./focusGrid"

// Whether the settings page is showing in place of the graph (v0.18.0).
// Not a dialog kind: it is a view like the file history, the gear and
// Ctrl+, toggle it, and leaving it puts the focus back on the grid.
export function useSettingsPage() {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen((o) => !o), [])
  const close = useCallback(() => {
    setOpen(false)
    focusGrid()
  }, [])
  return { open, toggle, close }
}

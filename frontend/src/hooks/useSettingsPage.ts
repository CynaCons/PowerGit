import { useCallback, useState } from "react"
import { focusGrid } from "./focusGrid"

// Whether the settings page is showing in place of the graph (v0.18.0).
// Not a dialog kind: it is a view like the file history, the gear and
// Ctrl+, toggle it, and leaving it puts the focus back on the grid.
const RAIL_KEEPS = new Set(["settings-button", "rail-toggle", "navrail"])

export function useSettingsPage() {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen((o) => !o), [])
  const close = useCallback(() => {
    setOpen(false)
    focusGrid()
  }, [])
  // A rail item leaving Settings for its own view (v0.21.6): no grid focus,
  // the view the click opens takes it.
  const leave = useCallback(() => setOpen(false), [])
  // v0.21.6, owner: "the settings view still overrides all the other views".
  // A click on any rail item but the gear and the expand toggle leaves
  // Settings first, then does what the item does.
  const railClick = useCallback(
    (event: React.MouseEvent) => {
      const id = (event.target as HTMLElement).closest("[data-testid]")?.getAttribute("data-testid")
      if (open && id && !RAIL_KEEPS.has(id)) setOpen(false)
    },
    [open],
  )
  return { open, toggle, close, leave, railClick }
}

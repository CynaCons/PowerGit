import { useCallback, useEffect, useState } from "react"

/**
 * The start pane's place in the window (v0.20.3, prototype B). It is a pane,
 * not a dialog: the rail's Recent repositories button swaps the main pane for
 * it and Escape puts the grid back — nothing is hidden behind a scrim.
 *
 * With no repository open there is no grid to go back to, so the pane is the
 * front door and Escape does nothing. Opening a repository closes it, which
 * is what picking one from the list means.
 */
export function useStartPane(hasRepo: boolean) {
  const [asked, setAsked] = useState(false)
  useEffect(() => {
    if (hasRepo) setAsked(false)
  }, [hasRepo])
  return {
    open: asked || !hasRepo,
    close: useCallback(() => setAsked(false), []),
    toggle: useCallback(() => setAsked((on) => !on), []),
  }
}

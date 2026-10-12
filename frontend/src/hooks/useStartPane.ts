import { useCallback, useEffect, useState } from "react"

/**
 * The start pane's place in the window (v0.20.3, prototype B). It is a pane,
 * not a dialog: the rail's Recent repositories button swaps the main pane for
 * it and Escape puts the grid back — nothing is hidden behind a scrim.
 *
 * With no repository open there is no grid to go back to, so the pane is the
 * front door and Escape does nothing. Opening a repository closes it, which
 * is what picking one from the list means — and since v0.20.10 that holds
 * for every way in, keyed on the repository that is open (`repoKey`): Open
 * folder… from the pane, the rail, Ctrl+O. Owner (2026-10-12): "When the user
 * has gone to the extent that he has selected a project, he wants to read the
 * history of that project."
 */
export function useStartPane(hasRepo: boolean, repoKey: string | null = null) {
  const [asked, setAsked] = useState(false)
  useEffect(() => {
    if (hasRepo) setAsked(false)
  }, [hasRepo, repoKey])
  return {
    open: asked || !hasRepo,
    close: useCallback(() => setAsked(false), []),
    toggle: useCallback(() => setAsked((on) => !on), []),
  }
}

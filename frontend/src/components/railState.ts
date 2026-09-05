// Expanded/collapsed state of the command rail, persisted per window user.
export const RAIL_STORAGE_KEY = "pg.rail"

export function readExpanded(): boolean {
  try {
    // Expanded on first run so the labels are discoverable; the toggle persists the choice.
    return window.localStorage.getItem(RAIL_STORAGE_KEY) !== "collapsed"
  } catch {
    return false
  }
}

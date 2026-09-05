// Expanded/collapsed state of the command rail, persisted per window user.
export const RAIL_STORAGE_KEY = "pg.rail"

export function readExpanded(): boolean {
  try {
    return window.localStorage.getItem(RAIL_STORAGE_KEY) === "expanded"
  } catch {
    return false
  }
}

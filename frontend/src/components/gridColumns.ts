// Column widths of the revision grid (v0.14.3, owner: "the columns that we
// have in the main graph view should be resizeable"). Message takes the
// remaining space; the four others are user-set pixels kept in
// localStorage. `null` for graph means "not set by the user": the grid
// keeps its automatic width (the lanes in view, capped to a share of the
// grid).

export type ColumnKey = "graph" | "author" | "date" | "sha"
export type ColumnWidths = { graph: number | null; author: number; date: number; sha: number }

export const STORAGE_KEY = "pg.gridColumns"
export const DEFAULT_WIDTHS: ColumnWidths = { graph: null, author: 128, date: 142, sha: 86 }
export const MIN_WIDTH: Record<ColumnKey, number> = { graph: 24, author: 40, date: 40, sha: 40 }
export const MAX_WIDTH = 1200

export function clampWidth(key: ColumnKey, value: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH[key], Math.round(value)))
}

export function loadWidths(storage: Pick<Storage, "getItem"> | null = safeStorage()): ColumnWidths {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_WIDTHS
    const parsed = JSON.parse(raw) as Partial<Record<ColumnKey, unknown>>
    const pick = (key: ColumnKey): number | null => {
      const v = parsed[key]
      return typeof v === "number" && Number.isFinite(v) ? clampWidth(key, v) : null
    }
    return {
      graph: pick("graph"),
      author: pick("author") ?? DEFAULT_WIDTHS.author,
      date: pick("date") ?? DEFAULT_WIDTHS.date,
      sha: pick("sha") ?? DEFAULT_WIDTHS.sha,
    }
  } catch {
    return DEFAULT_WIDTHS
  }
}

export function saveWidths(widths: ColumnWidths, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(widths))
  } catch {
    // Storage may be unavailable (private mode, quota); the widths still apply for the session.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

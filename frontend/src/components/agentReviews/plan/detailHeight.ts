// Heights on the plan screen, kept per user: the step detail under the graph
// (v0.22.2) and the top panel (v0.22.3).

export const DETAIL_KEY = "pg.planDetailHeight"
export const DETAIL_DEFAULT = 290
export const HEADER_KEY = "pg.planHeaderHeight"
export const HEADER_DEFAULT = 150
export const HEIGHT_MIN = 60

export function readHeight(key: string, fallback: number): number {
  try {
    const n = Number(window.localStorage.getItem(key))
    return Number.isFinite(n) && n >= HEIGHT_MIN ? n : fallback
  } catch {
    return fallback
  }
}

export function storeHeight(key: string, height: number): void {
  try {
    window.localStorage.setItem(key, String(Math.round(height)))
  } catch {
    // Storage refused: keep the height for this window.
  }
}

export const readDetailHeight = () => readHeight(DETAIL_KEY, DETAIL_DEFAULT)
export const readHeaderHeight = () => readHeight(HEADER_KEY, HEADER_DEFAULT)

// The step detail's height under the plan's graph (v0.22.2), kept per user.

const KEY = "pg.planDetailHeight"
export const DETAIL_DEFAULT = 290
export const DETAIL_MIN = 90

export function readDetailHeight(): number {
  try {
    const n = Number(window.localStorage.getItem(KEY))
    return Number.isFinite(n) && n >= DETAIL_MIN ? n : DETAIL_DEFAULT
  } catch {
    return DETAIL_DEFAULT
  }
}

export function storeDetailHeight(height: number): void {
  try {
    window.localStorage.setItem(KEY, String(Math.round(height)))
  } catch {
    // Storage refused: keep the height for this window.
  }
}

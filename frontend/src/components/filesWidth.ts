// The bottom panel's file-column width, shared by the Diff and File tree
// tabs and remembered across sessions (moved out of BottomPanel.tsx in
// v0.19.0 for the lint size limit; no behaviour change).

const FILES_WIDTH_STORAGE_KEY = "pg.bottomFilesWidth"
export const DEFAULT_FILES_WIDTH = 340
export const MIN_FILES_WIDTH = 180
export const MAX_FILES_WIDTH_RATIO = 0.7

export function readStoredFilesWidth(): number {
  try {
    const raw = window.localStorage.getItem(FILES_WIDTH_STORAGE_KEY)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FILES_WIDTH
  } catch {
    return DEFAULT_FILES_WIDTH
  }
}

export function writeStoredFilesWidth(width: number): void {
  try {
    window.localStorage.setItem(FILES_WIDTH_STORAGE_KEY, String(Math.round(width)))
  } catch {
    // Ignore storage failures (private mode, quota exceeded, disabled).
  }
}

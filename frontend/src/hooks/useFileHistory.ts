import { useCallback, useRef, useState } from "react"
import type { FileHistoryTarget } from "../components/FileHistoryView"

export type FileHistory = ReturnType<typeof useFileHistory>

// Which file history is open, if any (v0.16.0), and the file the Browse
// panel currently has selected so Ctrl+Shift+H can open its history from
// anywhere in the browse scope. The selection is a ref, not state: the
// bottom panel reports it on every change and nothing needs to re-render
// for it — the hotkey reads it when pressed.
export function useFileHistory() {
  const [target, setTarget] = useState<FileHistoryTarget | null>(null)
  const browseFile = useRef<string | null>(null)

  const open = useCallback((path: string, sha?: string | null) => setTarget({ path, sha: sha ?? null }), [])
  const close = useCallback(() => setTarget(null), [])
  const setBrowseFile = useCallback((path: string | null) => {
    browseFile.current = path
  }, [])
  /** Opens the history of the panel's selected file; nothing selected, nothing happens. */
  const openSelected = useCallback(
    (sha?: string | null) => {
      if (browseFile.current) open(browseFile.current, sha)
    },
    [open],
  )

  return { target, open, close, setBrowseFile, openSelected }
}

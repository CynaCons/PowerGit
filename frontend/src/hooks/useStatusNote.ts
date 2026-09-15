import { useCallback, useEffect, useRef, useState } from "react"

// A transient line in the status bar (v0.18.6, "Saved 0001-….patch" with
// Show in folder): the outcome of something that produced a file, shown
// where GE's status strip would say it, with one optional action. It goes
// away on its own after NOTE_MS, or when the caller clears it (App.tsx
// does so on the next row selection), so a stale "Saved" never sits under
// unrelated work.

export type StatusNote = {
  text: string
  action?: { label: string; run: () => void }
}

export type StatusNotes = ReturnType<typeof useStatusNote>

export const NOTE_MS = 10_000

export function useStatusNote() {
  const [note, setNoteState] = useState<StatusNote | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearNote = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setNoteState(null)
  }, [])

  const setNote = useCallback((next: StatusNote | null) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setNoteState(next)
    if (next) timer.current = setTimeout(() => setNoteState(null), NOTE_MS)
  }, [])

  useEffect(() => () => clearNote(), [clearNote])

  return { note, setNote, clearNote }
}

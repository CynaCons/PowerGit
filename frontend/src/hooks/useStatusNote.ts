import { useCallback, useEffect, useRef, useState } from "react"

// A transient line in the status bar (v0.18.6, "Saved 0001-….patch" with
// Show in folder): the outcome of something that produced a file, shown
// where GE's status strip would say it, with one optional action. It goes
// away on its own after NOTE_MS, when `clearOn` changes (App passes the
// selected SHA: the next row selection clears it) or when the caller
// clears it, so a stale "Saved" never sits under unrelated work.

export type StatusNote = {
  text: string
  action?: { label: string; run: () => void }
}

export type StatusNotes = ReturnType<typeof useStatusNote>

export const NOTE_MS = 10_000

export function useStatusNote(clearOn: unknown) {
  const [note, setNoteState] = useState<StatusNote | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Whether a note is up, mirrored in a ref so clearNote can dispatch
  // nothing when there is nothing to clear (v0.18.18). The clear on every
  // selection change runs in a passive effect of the click's SyncLane
  // render; with the bottom panel's deferred pass still pending on App's
  // fiber, React cannot take its eager same-state bailout (that needs
  // fiber.lanes empty), so setNoteState(null) enqueued a real update and
  // ran App's whole body once more inside the click task, note already
  // null. A functional updater would not help - the bailout is skipped
  // before the reducer runs - only not dispatching does
  // (docs/perf/reactivity-review-2026-09-17.md second pass, finding 9).
  const hasNote = useRef(false)

  const clearNote = useCallback(() => {
    if (!hasNote.current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    hasNote.current = false
    setNoteState(null)
  }, [])

  const setNote = useCallback((next: StatusNote | null) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    hasNote.current = next !== null
    setNoteState(next)
    if (next) {
      timer.current = setTimeout(() => {
        timer.current = null
        hasNote.current = false
        setNoteState(null)
      }, NOTE_MS)
    }
  }, [])

  // The next selection clears the note; unmounting clears the timer with it.
  useEffect(() => clearNote(), [clearNote, clearOn])
  useEffect(() => () => clearNote(), [clearNote])

  return { note, setNote, clearNote }
}

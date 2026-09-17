import { useCallback, useEffect, useRef, type RefObject } from "react"

// A held ArrowDown / ArrowUp / PageDown / PageUp in the grid (v0.18.18):
// Windows auto-repeats at ~30 Hz and every repeat used to select on its
// own - one synchronous App render per event, plus a scroll task once the
// selection reached the viewport edge - about three times the repeat
// interval in dev, so the keydown queue backed up and the selection went
// on moving after the key was released
// (docs/perf/reactivity-review-2026-09-17.md second pass, finding 2). A
// repeat now only advances the pending index and one requestAnimationFrame
// selects the latest; the first press (not a repeat) still selects at once,
// so a tap feels as it did. The pending index stays the base for the next
// repeat until the key is released: a repeat can land before React has
// committed the frame's selection, and starting over from the `selected`
// prop then would stall a step. Releasing the key, leaving the grid or
// unmounting drops what is pending (the hold has ended).
export function useHeldKey(onSelect: RefObject<(index: number) => void>) {
  const held = useRef<{ index: number; frame: number } | null>(null)

  /** The index the hold is heading for, if a hold is in progress. */
  const pending = useCallback(() => held.current?.index, [])

  const release = useCallback(() => {
    const h = held.current
    if (h === null) return
    if (h.frame !== 0) cancelAnimationFrame(h.frame)
    held.current = null
  }, [])

  /** A repeat: remember `index`, select it on the next frame (one frame at a time). */
  const repeat = useCallback(
    (index: number) => {
      const h = held.current ?? { index, frame: 0 }
      h.index = index
      if (h.frame === 0) {
        h.frame = requestAnimationFrame(() => {
          h.frame = 0
          onSelect.current(h.index)
        })
      }
      held.current = h
    },
    [onSelect],
  )

  useEffect(() => release, [release])

  return { pending, repeat, release }
}

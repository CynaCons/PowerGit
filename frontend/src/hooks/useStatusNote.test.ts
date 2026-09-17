// @vitest-environment jsdom
import { act, createElement, useDeferredValue, useEffect, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NOTE_MS, useStatusNote } from "./useStatusNote"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// App's shape around the note (v0.18.18, docs/perf/reactivity-review-
// 2026-09-17.md second pass, finding 9): the selection is urgent state,
// the bottom panel reads it through useDeferredValue, and a passive effect
// clears the note on every selection change. Counting the probe's renders
// per selection is the measurement: 2 (urgent + deferred) when clearNote
// dispatches nothing, 3 when a setState(null) sneaks a SyncLane update in
// while the deferred pass is pending.
describe("useStatusNote", () => {
  let root: Root
  let container: HTMLDivElement
  let renders = 0
  let latest: (ReturnType<typeof useStatusNote> & { setSel: (n: number) => void; deferred: number }) | null = null

  function Probe() {
    renders++
    const [sel, setSel] = useState(0)
    const deferred = useDeferredValue(sel)
    const notes = useStatusNote()
    const { clearNote } = notes
    useEffect(() => clearNote(), [clearNote, sel])
    latest = { ...notes, setSel, deferred }
    return null
  }

  beforeEach(async () => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(createElement(Probe)))
    renders = 0
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    latest = null
    vi.useRealTimers()
  })

  it("a selection change with no note up costs the urgent and the deferred render only, never a third", () => {
    act(() => latest!.setSel(1))
    expect(latest!.deferred).toBe(1)
    expect(renders).toBe(2)
    act(() => latest!.setSel(2))
    expect(renders).toBe(4)
  })

  it("a note up is cleared by the next selection, then the one after costs nothing extra again", () => {
    act(() => latest!.setNote({ text: "Saved 0001-a.patch" }))
    expect(latest!.note?.text).toBe("Saved 0001-a.patch")
    renders = 0
    act(() => latest!.setSel(1))
    expect(latest!.note).toBeNull()
    expect(renders).toBe(3)
    renders = 0
    act(() => latest!.setSel(2))
    expect(renders).toBe(2)
  })

  it("the note fades on its own after NOTE_MS and stays clear afterwards", () => {
    vi.useFakeTimers()
    act(() => latest!.setNote({ text: "Saved" }))
    act(() => {
      vi.advanceTimersByTime(NOTE_MS)
    })
    expect(latest!.note).toBeNull()
    renders = 0
    act(() => latest!.clearNote())
    expect(renders).toBe(0)
  })
})

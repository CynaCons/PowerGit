// @vitest-environment jsdom
import { act, createElement, type RefObject } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DiffViewHandle } from "../components/DiffView"
import type { FileChange } from "../engine"
import { HotkeyHost } from "../hotkeys"
import { getReviewDoc, setReviewMode } from "../review/reviewState"
import { progressOf, rowKeysOf, useDiffReview, type DiffReview, type RowKeys } from "./useDiffReview"

// The review layer over one diff (v0.17.0): the hook is rendered under the
// real HotkeyHost and driven by keydown events from inside the review
// surface, the way the Diff tab's list receives them. The document is the
// module store's, so every test uses its own key.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const DIFF = [
  "diff --git a/f.txt b/f.txt",
  "@@ -1,3 +1,5 @@",
  " one", // 2: context
  "+first", // 3: +2
  " two", // 4: context
  "+second", // 5: +4
  "-three", // 6: -3
].join("\n")

const FILES: FileChange[] = [
  { path: "f.txt", status: "M", binary: false },
  { path: "g.txt", status: "M", binary: false },
]

type Props = { reviewKey: string | null; path: string | null; rowKeys: RowKeys; selectedPath: string | null }

describe("useDiffReview", () => {
  let root: Root
  let container: HTMLDivElement
  let surface: HTMLDivElement
  let latest: DiffReview | null = null
  const handle = { scrollToRow: vi.fn(), focus: vi.fn() }
  const diffRef: RefObject<DiffViewHandle | null> = { current: handle }
  const onSelect = vi.fn()

  function Harness(props: Props) {
    latest = useDiffReview({ ...props, files: FILES, onSelect, diffRef })
    return null
  }
  const render = (props: Props) =>
    act(async () => root.render(createElement(HotkeyHost, null, createElement(Harness, props))))
  const press = (key: string, mods: { shiftKey?: boolean; ctrlKey?: boolean } = {}) =>
    act(async () => {
      surface.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods }))
    })
  const shown = (key: string, path = "f.txt"): Props => ({
    reviewKey: key,
    path,
    rowKeys: rowKeysOf(DIFF),
    selectedPath: path,
  })

  beforeEach(() => {
    latest = null
    handle.scrollToRow.mockClear()
    handle.focus.mockClear()
    onSelect.mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    // Beside React's container, not inside it: the first render clears that.
    surface = document.createElement("div")
    surface.setAttribute("data-hotkey-surface", "review")
    surface.tabIndex = 0
    document.body.appendChild(surface)
    surface.focus()
    root = createRoot(container)
    setReviewMode(true)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    surface.remove()
    setReviewMode(false)
  })

  it("keys the parsed rows: +new for added, -old for removed, null elsewhere", () => {
    expect(rowKeysOf(DIFF)).toEqual([null, null, null, "+2", null, "+4", "-3"])
    expect(progressOf(null, "f.txt", rowKeysOf(DIFF))).toEqual({ reviewed: 0, changed: 3, rejected: 0 })
  })

  it("Space with no cursor marks the first unreviewed line and puts the cursor there; the doc counts this file", async () => {
    await render(shown("k-space"))
    expect(latest?.reviewing).toBe(true)
    expect(latest?.review?.cursor).toBeNull()
    await press(" ")
    expect(latest?.review?.cursor).toBe(3)
    expect(latest?.review?.stateOf("+2")).toBe("ok")
    expect(handle.scrollToRow).toHaveBeenLastCalledWith(3)
    const doc = getReviewDoc("k-space")
    expect(doc?.files["f.txt"].lines).toEqual({ "+2": "ok" })
    expect([doc?.reviewed, doc?.changed, doc?.status]).toEqual([1, 3, "in-progress"])
    // Space again cycles the same line, x toggles rejected, Space clears.
    await press(" ")
    expect(latest?.review?.stateOf("+2")).toBe("rejected")
    await press("x")
    expect(latest?.review?.stateOf("+2")).toBeUndefined()
    await press("x")
    expect(latest?.review?.stateOf("+2")).toBe("rejected")
    await press(" ")
    expect(latest?.review?.stateOf("+2")).toBeUndefined()
  })

  it("j/k and the arrows move over every row, context included; Space on a context row marks nothing", async () => {
    await render(shown("k-move"))
    await press("j")
    expect(latest?.review?.cursor).toBe(0)
    await press("ArrowDown")
    await press("j")
    expect(latest?.review?.cursor).toBe(2)
    await press(" ")
    expect(getReviewDoc("k-move")).toBeNull()
    await press("k")
    await press("ArrowUp")
    await press("k")
    expect(latest?.review?.cursor).toBe(0)
    await press("G", { shiftKey: true })
    expect(latest?.review?.cursor).toBe(6)
    await press("Home")
    expect(latest?.review?.cursor).toBe(0)
    await press("End")
    expect(latest?.review?.cursor).toBe(6)
  })

  it("gg goes to the top; a single g passes through", async () => {
    await render(shown("k-gg"))
    await press("End")
    const lone = new KeyboardEvent("keydown", { key: "g", bubbles: true, cancelable: true })
    await act(async () => {
      surface.dispatchEvent(lone)
    })
    expect(lone.defaultPrevented).toBe(false)
    expect(latest?.review?.cursor).toBe(6)
    await press("g")
    expect(latest?.review?.cursor).toBe(0)
  })

  it("n jumps to the next unreviewed line, wrapping, and stays when the cursor sits on the only one left", async () => {
    await render(shown("k-next"))
    await press("n")
    expect(latest?.review?.cursor).toBe(3)
    expect(handle.focus).toHaveBeenCalled()
    await press(" ") // +2 ok
    await press("n")
    expect(latest?.review?.cursor).toBe(5)
    await press("x") // +4 rejected
    await press("n")
    expect(latest?.review?.cursor).toBe(6)
    await press("End")
    await press("n")
    expect(latest?.review?.cursor).toBe(6)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("n with nothing left in this file selects the next file with work and lands on its first unreviewed line", async () => {
    await render(shown("k-cross"))
    await press("n")
    await press(" ")
    await press("n")
    await press(" ")
    await press("n")
    await press(" ")
    expect(progressOf(getReviewDoc("k-cross"), "f.txt", rowKeysOf(DIFF)).reviewed).toBe(3)
    await press("n")
    expect(onSelect).toHaveBeenCalledWith("g.txt")
    // g.txt is selected but f.txt is still on screen: nothing moves yet.
    await render({ ...shown("k-cross"), selectedPath: "g.txt" })
    expect(latest?.review?.cursor).toBe(6)
    handle.focus.mockClear()
    // g.txt's diff arrives: cursor on its first changed row, focus in the diff.
    await render({ ...shown("k-cross", "g.txt"), rowKeys: [null, null, "+1", null, "+3"] })
    expect(latest?.review?.cursor).toBe(2)
    expect(handle.focus).toHaveBeenCalled()
  })

  it("Enter and Shift+Enter walk the file list, wrapping, cursor on row 0 once the diff is shown", async () => {
    await render(shown("k-enter"))
    await press("End")
    await press("Enter")
    expect(onSelect).toHaveBeenLastCalledWith("g.txt")
    await render({ ...shown("k-enter", "g.txt") })
    expect(latest?.review?.cursor).toBe(0)
    expect(handle.focus).toHaveBeenCalled()
    await press("Enter")
    expect(onSelect).toHaveBeenLastCalledWith("f.txt")
    await render(shown("k-enter"))
    await press("Enter", { shiftKey: true })
    expect(onSelect).toHaveBeenLastCalledWith("g.txt")
  })

  it("marks stay per file across a switch while the cursor starts over; Ctrl+Space is not the layer's", async () => {
    await render(shown("k-switch"))
    await press(" ")
    expect(latest?.review?.cursor).toBe(3)
    await render(shown("k-switch", "g.txt"))
    expect(latest?.review?.cursor).toBeNull()
    expect(latest?.review?.stateOf("+2")).toBeUndefined()
    await render(shown("k-switch"))
    expect(latest?.review?.cursor).toBeNull()
    expect(latest?.review?.stateOf("+2")).toBe("ok")
    const ctrlSpace = new KeyboardEvent("keydown", { key: " ", ctrlKey: true, bubbles: true, cancelable: true })
    await act(async () => {
      surface.dispatchEvent(ctrlSpace)
    })
    expect(ctrlSpace.defaultPrevented).toBe(false)
    expect(latest?.review?.stateOf("+2")).toBe("ok")
  })

  it("is off without a key, and the toggle focuses the diff only when turning on", async () => {
    setReviewMode(false)
    await render({ ...shown("k-toggle"), reviewKey: null })
    expect(latest?.reviewing).toBe(false)
    expect(latest?.review).toBeUndefined()
    await render(shown("k-toggle"))
    expect(latest?.reviewing).toBe(false)
    await act(async () => latest?.toggle())
    expect(latest?.reviewing).toBe(true)
    expect(handle.focus).toHaveBeenCalledTimes(1)
    await act(async () => latest?.toggle())
    expect(latest?.reviewing).toBe(false)
    expect(latest?.review).toBeUndefined()
    expect(handle.focus).toHaveBeenCalledTimes(1)
  })
})

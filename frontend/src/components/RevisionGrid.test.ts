// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { graphWidth } from "../graph/draw"
import { layoutGraph } from "../graph/layout"
import type { Revision } from "../graph/types"
import { RevisionGrid } from "./RevisionGrid"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const widthSpy = vi.mocked(graphWidth)
const rowRenderCount = vi.hoisted(() => ({ count: 0 }))
const virtualizerProbe = vi.hoisted(() => ({ value: null as unknown }))

vi.mock("../graph/draw", async (importActual) => {
  const actual = await importActual<typeof import("../graph/draw")>()
  return { ...actual, graphWidth: vi.fn(actual.graphWidth) }
})

vi.mock("./RevisionRow", async () => {
  const { memo } = await import("react")
  return {
    RevisionRow: memo(() => {
      rowRenderCount.count++
      return null
    }),
  }
})

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => {
    if (virtualizerProbe.value) return virtualizerProbe.value
    const items = Array.from({ length: count }, (_, index) => ({
      index,
      start: index * 28,
      size: 28,
      end: (index + 1) * 28,
    }))
    virtualizerProbe.value = {
      getTotalSize: () => count * 28,
      getVirtualItems: () => items,
      measurementsCache: items,
      measureElement: () => undefined,
      scrollToIndex: () => undefined,
    }
    return virtualizerProbe.value
  },
}))

function revision(id: string, parents: string[]): Revision {
  return {
    id: id.padEnd(40, "0"),
    parents: parents.map((parent) => parent.padEnd(40, "0")),
    message: id,
    author: "a",
    date: "",
    refs: [],
  }
}

let root: Root | undefined
let host: HTMLDivElement | undefined

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  vi.clearAllMocks()
  rowRenderCount.count = 0
  virtualizerProbe.value = null
})

describe("RevisionGrid graph width", () => {
  it("does not rescan unchanged rows when a parent rerender changes selection", () => {
    const rows = layoutGraph([revision("head", ["base"]), revision("base", [])])
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    const render = (selected: number) =>
      root!.render(createElement(RevisionGrid, { rows, selected, onSelect: () => undefined }))

    act(() => render(0))
    expect(widthSpy).toHaveBeenCalledTimes(1)
    act(() => render(1))
    expect(widthSpy).toHaveBeenCalledTimes(1)
  })

  it("only rerenders the two selected rows when onSelect changes identity", () => {
    const id = (i: number) => `r${String(i).padStart(4, "0")}`
    const rows = layoutGraph(Array.from({ length: 60 }, (_, i) => revision(id(i), i === 59 ? [] : [id(i + 1)])))
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    const render = (selected: number) =>
      root!.render(createElement(RevisionGrid, { rows, selected, onSelect: () => undefined }))

    act(() => render(0))
    expect(rowRenderCount.count).toBe(60)
    rowRenderCount.count = 0
    act(() => render(1))
    expect(rowRenderCount.count).toBe(2)
  })
})

// A held arrow / page key (v0.18.18, docs/perf/reactivity-review-2026-09-17.md
// second pass, finding 2): the auto-repeats coalesce to one selection per
// animation frame; the first press stays immediate. The frame queue is
// hand-rolled so the test decides when a frame paints.
describe("RevisionGrid held keys", () => {
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 1
  const paint = () => {
    const due = [...frames.values()]
    frames.clear()
    act(() => due.forEach((cb) => cb(0)))
  }
  const key = (el: HTMLElement, type: "keydown" | "keyup", key: string, repeat = false) =>
    act(() => {
      el.dispatchEvent(new KeyboardEvent(type, { key, repeat, bubbles: true, cancelable: true }))
    })

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = nextFrame++
      frames.set(id, cb)
      return id
    })
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames.delete(id)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    frames.clear()
  })

  function mount(selected: number, onSelect: (index: number) => void) {
    const id = (i: number) => `r${String(i).padStart(4, "0")}`
    const rows = layoutGraph(Array.from({ length: 60 }, (_, i) => revision(id(i), i === 59 ? [] : [id(i + 1)])))
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    const render = (sel: number) =>
      act(() => root!.render(createElement(RevisionGrid, { rows, selected: sel, onSelect })))
    render(selected)
    return { body: host.querySelector<HTMLDivElement>(".grid-body")!, render }
  }

  it("the first press selects at once; 10 repeats inside one frame select once, the final index; later repeats build on it", () => {
    const onSelect = vi.fn()
    const { body, render } = mount(0, onSelect)
    key(body, "keydown", "ArrowDown")
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenLastCalledWith(1)
    expect(frames.size).toBe(0)
    render(1) // the App commits the selection

    for (let i = 0; i < 10; i++) key(body, "keydown", "ArrowDown", true)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(1)
    paint()
    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onSelect).toHaveBeenLastCalledWith(11)
    // React has not committed 11 yet (the prop is still 1): the next repeats
    // still go on from the pending index instead of stalling at 2.
    for (let i = 0; i < 3; i++) key(body, "keydown", "ArrowDown", true)
    paint()
    expect(onSelect).toHaveBeenCalledTimes(3)
    expect(onSelect).toHaveBeenLastCalledWith(14)
  })

  it("PageDown repeats coalesce the same way; a held End stays immediate", () => {
    const onSelect = vi.fn()
    const { body } = mount(5, onSelect)
    // jsdom has no layout: a page is one row.
    key(body, "keydown", "PageUp", true)
    key(body, "keydown", "PageUp", true)
    expect(onSelect).not.toHaveBeenCalled()
    paint()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenLastCalledWith(3)
    key(body, "keydown", "End", true)
    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onSelect).toHaveBeenLastCalledWith(59)
    expect(frames.size).toBe(0)
  })

  it("releasing the key, leaving the grid or unmounting drops the pending frame", () => {
    const onSelect = vi.fn()
    const { body } = mount(0, onSelect)
    for (let i = 0; i < 3; i++) key(body, "keydown", "ArrowDown", true)
    expect(frames.size).toBe(1)
    key(body, "keyup", "ArrowDown")
    expect(frames.size).toBe(0)
    paint()
    expect(onSelect).not.toHaveBeenCalled()
    // The next hold starts over from the selected prop.
    key(body, "keydown", "ArrowDown", true)
    act(() => {
      body.dispatchEvent(new FocusEvent("focusout", { bubbles: true })) // React's onBlur
    })
    expect(frames.size).toBe(0)
    key(body, "keydown", "ArrowDown", true)
    paint()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenLastCalledWith(1)

    key(body, "keydown", "ArrowDown", true)
    expect(frames.size).toBe(1)
    act(() => root!.unmount())
    root = undefined
    expect(frames.size).toBe(0)
  })
})

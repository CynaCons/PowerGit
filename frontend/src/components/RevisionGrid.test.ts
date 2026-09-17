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
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (index: number) => string | number }) => {
    const items = Array.from({ length: count }, (_, index) => ({
      index,
      key: getItemKey(index),
      start: index * 28,
      size: 28,
      end: (index + 1) * 28,
    }))
    if (!virtualizerProbe.value) {
      virtualizerProbe.value = {
        getTotalSize: () => 0,
        getVirtualItems: () => [],
        measurementsCache: [],
        measureElement: () => undefined,
        scrollToIndex: () => undefined,
      }
    }
    const probe = virtualizerProbe.value as {
      getTotalSize: () => number
      getVirtualItems: () => typeof items
      measurementsCache: typeof items
    }
    probe.getTotalSize = () => count * 28
    probe.getVirtualItems = () => items
    probe.measurementsCache = items
    return probe
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

describe("RevisionGrid graph width", () => {
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

  it("keeps the visible row at its offset when a reload prepends rows, but leaves the top at zero", () => {
    const makeRows = (from: number, count: number) =>
      layoutGraph(
        Array.from({ length: count }, (_, offset) => revision(`r${String(from + offset).padStart(4, "0")}`, [])),
      )
    const rows = makeRows(5, 30)
    const prepended = [...makeRows(0, 5), ...rows]
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    const render = (nextRows: typeof rows) =>
      root!.render(createElement(RevisionGrid, { rows: nextRows, selected: -1, onSelect: () => undefined }))

    act(() => render(rows))
    const body = host.querySelector<HTMLElement>('[data-testid="grid-body"]')!
    body.scrollTop = 287
    act(() => render(rows))
    const oldOffset = 10 * 28 - body.scrollTop
    act(() => render(prepended))
    expect(body.scrollTop).toBe(427)
    expect(15 * 28 - body.scrollTop).toBe(oldOffset)

    body.scrollTop = 0
    act(() => render(rows))
    act(() => render(prepended))
    expect(body.scrollTop).toBe(0)
  })
})

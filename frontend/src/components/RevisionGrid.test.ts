// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { graphWidth } from "../graph/draw"
import { layoutGraph } from "../graph/layout"
import type { Revision } from "../graph/types"
import { RevisionGrid } from "./RevisionGrid"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const widthSpy = vi.mocked(graphWidth)

vi.mock("../graph/draw", async (importActual) => {
  const actual = await importActual<typeof import("../graph/draw")>()
  return { ...actual, graphWidth: vi.fn(actual.graphWidth) }
})

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

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
    vi.clearAllMocks()
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
})

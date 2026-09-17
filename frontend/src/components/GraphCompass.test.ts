// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { navTargets } from "../graph/graphNav"
import { layoutGraph } from "../graph/layout"
import type { Revision } from "../graph/types"
import { GraphCompass } from "./GraphCompass"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

// The compass sits outside .grid-body (v0.18.18, docs/perf/reactivity-
// review-2026-09-17.md second pass, finding 7): a click that moved focus
// onto its button left the plain arrows dead until the grid was clicked
// again. jsdom does not move focus on mousedown itself, so the proof is
// the default being prevented on the way through Tooltip and IconButton,
// with the click and Tab focus intact.
describe("GraphCompass", () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
  })

  it("a mouse click on a button does not take keyboard focus; the click still navigates and Tab still reaches it", async () => {
    const rows = layoutGraph([revision("head", ["mid"]), revision("mid", ["base"]), revision("base", [])])
    const goToParent = vi.fn()
    const nav = {
      targets: navTargets(rows, rows[1]),
      loadingTarget: null,
      goToParent,
      goToChild: vi.fn(),
      goToHead: vi.fn(),
    }
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(createElement(GraphCompass, { rows, nav })))
    const parent = host.querySelector<HTMLButtonElement>('[data-testid="graph-nav-parent"]')!
    expect(parent.getAttribute("aria-disabled")).toBeNull()

    // Async act: MUI mounts the ripple lazily and starts it in a microtask.
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 })
    await act(async () => {
      parent.dispatchEvent(down)
    })
    expect(down.defaultPrevented).toBe(true)
    await act(async () => {
      parent.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }))
    })
    expect(goToParent).toHaveBeenCalledTimes(1)

    await act(async () => parent.focus())
    expect(document.activeElement).toBe(parent)
  })
})

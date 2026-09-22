// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { RecentInfo } from "../engine"
import { StartPane, type StartPaneProps } from "./StartPane"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const recents: RecentInfo[] = [
  { id: "1", name: "Alpha", root: "/alpha", branch: "main", pinned: true, lastOpened: new Date().toISOString() },
  { id: "2", name: "Beta", root: "/beta", branch: "feature", lastOpened: new Date().toISOString() },
]

describe("StartPane", () => {
  let host: HTMLDivElement
  let root: Root
  let props: StartPaneProps
  beforeEach(() => {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    props = {
      recents,
      peeks: new Map(),
      detail: null,
      onSelect: vi.fn(),
      onOpen: vi.fn(),
      onForget: vi.fn(),
      onPin: vi.fn(),
      onOpenFolder: vi.fn(),
      onTerminal: vi.fn(),
      onCopyPath: vi.fn(),
      onClose: vi.fn(),
    }
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
  })
  const render = () => act(() => root.render(<StartPane {...props} />))
  const key = (value: string) =>
    act(() =>
      host
        .querySelector('[data-testid="start-pane"]')!
        .dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true })),
    )
  const type = (input: HTMLInputElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })

  it("renders groups, filters, walks the cursor and opens", () => {
    render()
    expect(host.querySelectorAll('[data-testid="start-group"]')).toHaveLength(2)
    const input = host.querySelector('[data-testid="start-filter"]') as HTMLInputElement
    type(input, "feature")
    expect(host.querySelectorAll('[data-testid="start-row"]')).toHaveLength(1)
    type(input, "")
    key("ArrowDown")
    key("Enter")
    expect(props.onSelect).toHaveBeenCalledWith("/beta")
    expect(props.onOpen).toHaveBeenCalledWith("/beta")
  })

  it("pins and delays Delete with Undo", () => {
    vi.useFakeTimers()
    render()
    act(() => (host.querySelector('[data-testid="start-pin"]') as HTMLButtonElement).click())
    expect(props.onPin).toHaveBeenCalledWith("/alpha", false)
    key("Delete")
    expect(host.querySelector('[data-testid="start-undo"]')).not.toBeNull()
    act(() => (host.querySelector('[data-testid="start-undo"]') as HTMLButtonElement).click())
    act(() => vi.advanceTimersByTime(5000))
    expect(props.onForget).not.toHaveBeenCalled()
  })

  it("renders the empty state", () => {
    props.recents = []
    render()
    expect(host.querySelector('[data-testid="start-empty"]')?.textContent).toContain("No repositories yet")
  })
})

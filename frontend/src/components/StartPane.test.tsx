// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { WorkspaceInfo, WorktreeInfo } from "../engine"
import { StartPane, type StartPaneProps } from "./StartPane"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const now = new Date().toISOString()
const tree = (name: string, extra: Partial<WorktreeInfo> = {}): WorktreeInfo => ({
  root: `/p/${name}`,
  name,
  branch: `feature/${name}`,
  main: false,
  detached: false,
  lastOpened: now,
  pinned: false,
  id: name,
  ...extra,
})
const workspaces: WorkspaceInfo[] = [
  {
    name: "alpha",
    mainRoot: "/p/alpha",
    lastOpened: now,
    pinned: false,
    worktrees: [
      tree("alpha", { main: true, branch: "main" }),
      tree("alpha-fix"),
      tree("alpha-new", { lastOpened: null, id: null }),
    ],
  },
  {
    name: "beta",
    mainRoot: "/p/beta",
    lastOpened: now,
    pinned: false,
    worktrees: [tree("beta", { main: true, branch: "main" })],
  },
]

describe("StartPane (repository cards)", () => {
  let host: HTMLDivElement
  let root: Root
  let props: StartPaneProps
  beforeEach(() => {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    props = {
      workspaces,
      peeks: new Map(),
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
  const all = (testid: string) => host.querySelectorAll(`[data-testid="${testid}"]`)
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

  it("draws a card per repository with every worktree, the never-opened one marked", () => {
    render()
    expect(all("start-card")).toHaveLength(2)
    expect(all("start-row")).toHaveLength(4)
    const never = host.querySelector('[data-never="true"]')
    expect(never?.getAttribute("data-root")).toBe("/p/alpha-new")
    expect(never?.textContent).toContain("never opened")
    expect(all("start-main")).toHaveLength(2)
  })

  it("opens on one click", () => {
    render()
    act(() => (all("start-row")[1] as HTMLElement).click())
    expect(props.onOpen).toHaveBeenCalledWith("/p/alpha-fix")
  })

  it("filters by branch or path, walks the cursor with the arrows and opens with Enter", () => {
    render()
    const input = host.querySelector('[data-testid="start-filter"]') as HTMLInputElement
    type(input, "feature/alpha-f")
    expect(all("start-row")).toHaveLength(1)
    type(input, "/p/beta")
    expect(all("start-card")).toHaveLength(1)
    type(input, "")
    key("ArrowDown")
    key("Enter")
    expect(props.onOpen).toHaveBeenCalledWith("/p/alpha-fix")
  })

  it("pins from the row, and delays Delete with Undo", () => {
    vi.useFakeTimers()
    render()
    act(() => (all("start-pin")[0] as HTMLButtonElement).click())
    expect(props.onPin).toHaveBeenCalledWith("/p/alpha", true)
    expect(props.onOpen).not.toHaveBeenCalled()
    key("Delete")
    expect(host.querySelector('[data-testid="start-undo"]')).not.toBeNull()
    act(() => (host.querySelector('[data-testid="start-undo"]') as HTMLButtonElement).click())
    act(() => vi.advanceTimersByTime(5000))
    expect(props.onForget).not.toHaveBeenCalled()
  })

  it("offers no Remove on a worktree that was never opened", () => {
    render()
    const never = host.querySelector('[data-never="true"]')!
    expect(never.querySelector('[data-testid="start-remove"]')).toBeNull()
  })

  it("renders the empty state", () => {
    props.workspaces = []
    render()
    expect(host.querySelector('[data-testid="start-empty"]')?.textContent).toContain("No repositories yet")
  })
})

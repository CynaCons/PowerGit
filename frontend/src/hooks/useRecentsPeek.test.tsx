// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { EngineContext, type EngineContextValue } from "../engine/useEngine"
import type { EngineClient, RecentInfo } from "../engine"
import { useRecentsPeek } from "./useRecentsPeek"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const recents: RecentInfo[] = [{ id: "1", name: "Alpha", root: "/alpha", branch: "main" }]

describe("useRecentsPeek", () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined
  afterEach(() => {
    if (root) act(() => root!.unmount())
    host?.remove()
    vi.useRealTimers()
  })

  it("loads the list once, caches detail per selection, and swallows failures", async () => {
    vi.useFakeTimers()
    const client = {
      peekRepos: vi.fn().mockResolvedValue([{ root: "/alpha", exists: true }]),
      peekRepo: vi
        .fn()
        .mockResolvedValueOnce({ root: "/alpha", exists: true, commits: [] })
        .mockRejectedValueOnce(new Error("nope")),
    } as unknown as EngineClient
    let selected: string | null = "/alpha"
    let latest: ReturnType<typeof useRecentsPeek> | undefined
    const Probe = () => {
      latest = useRecentsPeek(recents, selected)
      return null
    }
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    const render = () =>
      act(() =>
        root!.render(
          <EngineContext.Provider value={{ base: client, repo: client } satisfies EngineContextValue}>
            <Probe />
          </EngineContext.Provider>,
        ),
      )
    render()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(client.peekRepos).toHaveBeenCalledTimes(1)
    expect(client.peekRepo).toHaveBeenCalledTimes(1)
    expect(latest?.detail?.root).toBe("/alpha")
    selected = null
    render()
    selected = "/alpha"
    render()
    expect(client.peekRepo).toHaveBeenCalledTimes(1)
    selected = "/missing"
    render()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(latest?.detail).toBeNull()
  })
})

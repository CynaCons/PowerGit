// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AgentReviewList, EngineClient } from "../engine"
import { useAgentReviews } from "./useAgentReviews"

describe("useAgentReviews", () => {
  afterEach(() => vi.useRealTimers())
  it("loads immediately, replaces on the poll, and stops after unmount", async () => {
    vi.useFakeTimers()
    const values: AgentReviewList[] = [
      { sessions: [], badge: 1 },
      { sessions: [], badge: 2 },
    ]
    const request = vi.fn(() => Promise.resolve(new Response(JSON.stringify(values.shift()), { status: 200 })))
    const engine = { repoPath: () => "/repos/r", request } as unknown as EngineClient
    const state: { current: ReturnType<typeof useAgentReviews> | null } = { current: null }
    function Harness() {
      state.current = useAgentReviews({ engine })
      return null
    }
    const node = document.createElement("div")
    const root = createRoot(node)
    await act(async () => root.render(createElement(Harness)))
    await act(async () => Promise.resolve())
    expect(state.current?.badge).toBe(1)
    await act(async () => vi.advanceTimersByTimeAsync(5000))
    expect(state.current?.badge).toBe(2)
    await act(async () => root.unmount())
    await act(async () => vi.advanceTimersByTimeAsync(5000))
    expect(request).toHaveBeenCalledTimes(2)
  })
})

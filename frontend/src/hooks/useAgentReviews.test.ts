// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AgentReviewEverywhere, EngineClient } from "../engine"
import { useAgentReviews } from "./useAgentReviews"

describe("useAgentReviews", () => {
  afterEach(() => vi.useRealTimers())
  it("loads immediately, replaces on the poll, and stops after unmount", async () => {
    vi.useFakeTimers()
    const values: AgentReviewEverywhere[] = [
      { sessions: [], badge: 1 },
      { sessions: [], badge: 2 },
    ]
    const request = vi.fn(() => Promise.resolve(new Response(JSON.stringify(values.shift()), { status: 200 })))
    // repoPath() throws with no repository open; the every-repo list must not
    // need it, so the badge and the inbox work with no repository (v0.21.10).
    const engine = {
      repoPath: () => {
        throw new Error("no repository open")
      },
      request,
    } as unknown as EngineClient
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
    expect(request).toHaveBeenCalledWith("/agent-reviews", {}, { signal: expect.anything() })
    await act(async () => vi.advanceTimersByTimeAsync(5000))
    expect(state.current?.badge).toBe(2)
    await act(async () => root.unmount())
    await act(async () => vi.advanceTimersByTimeAsync(5000))
    expect(request).toHaveBeenCalledTimes(2)
  })
})

// @vitest-environment jsdom
import { act } from "react"
import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useJobs } from "./useJobs"

describe("useJobs", () => {
  it("runs an operation confirmed during another engine call after it, showing Waiting for", async () => {
    vi.useFakeTimers()
    let release: () => void = () => undefined
    const first = new Promise<void>((resolve) => (release = resolve))
    const dispatch = vi.fn()
    const { result } = renderHook(() =>
      useJobs({
        client: {} as never,
        dispatch,
        busy: false,
        setEngineError: vi.fn(),
        refresh: vi.fn().mockResolvedValue(undefined),
        handleFailure: (e) => String(e),
      }),
    )
    const started: string[] = []
    void result.current.withBusy("Fetching origin", async () => {
      started.push("fetch")
      await first
    })
    await act(() => Promise.resolve())
    const queued = result.current.withBusy("Resetting", async () => {
      started.push("reset")
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(result.current.jobLabel).toBe("Waiting for Fetching origin…")
    expect(started).toEqual(["fetch"])
    release()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    await queued
    expect(started).toEqual(["fetch", "reset"])
    vi.useRealTimers()
  })
})

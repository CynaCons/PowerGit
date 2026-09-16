// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useJobs } from "./useJobs"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe("useJobs", () => {
  let root: Root
  let container: HTMLDivElement
  let latest: ReturnType<typeof useJobs> | null = null

  function Probe() {
    latest = useJobs({
      client: {} as never,
      dispatch: vi.fn(),
      busy: false,
      setEngineError: vi.fn(),
      refresh: vi.fn().mockResolvedValue(undefined),
      handleFailure: (e) => String(e),
    })
    return null
  }

  beforeEach(async () => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(createElement(Probe)))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    latest = null
    vi.useRealTimers()
  })

  it("runs an operation confirmed during another engine call after it, showing Waiting for", async () => {
    vi.useFakeTimers()
    let release: () => void = () => undefined
    const first = new Promise<void>((resolve) => (release = resolve))
    const started: string[] = []
    act(() => {
      void latest!.withBusy("Fetching origin", async () => {
        started.push("fetch")
        await first
      })
    })
    await act(() => Promise.resolve())
    let queued: Promise<void>
    act(() => {
      queued = latest!.withBusy("Resetting", async () => {
        started.push("reset")
      })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(latest?.jobLabel).toBe("Waiting for Fetching origin…")
    expect(started).toEqual(["fetch"])
    await act(async () => {
      release()
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    await queued
    expect(started).toEqual(["fetch", "reset"])
  })
})

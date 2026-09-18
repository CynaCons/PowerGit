// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { EngineClient } from "../engine"
import { serializeDoc } from "../review/reviewFile"
import { emptyDoc, withLine } from "../review/reviewModel"
import { getReviewDoc, setReviewDoc } from "../review/reviewState"
import { useReview } from "./useReview"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const KEY = "a".repeat(40)

describe("useReview", () => {
  let root: Root
  let host: HTMLDivElement
  let latest: ReturnType<typeof useReview>
  const requests: { path: string; init: RequestInit; signal?: AbortSignal }[] = []
  const engine = {
    repoPath: () => "/repos/r",
    request: vi.fn(async (path: string, init: RequestInit = {}, options: { signal?: AbortSignal } = {}) => {
      requests.push({ path, init, signal: options.signal })
      if (!init.method) return new Response(serializeDoc(withLine(emptyDoc(KEY), "a.ts", "+1", "ok")))
      return new Response(null, { status: 204 })
    }),
  } as unknown as EngineClient

  function Probe({ reviewKey }: { reviewKey: string | null }) {
    latest = useReview({ engine, key: reviewKey })
    return null
  }
  const render = (reviewKey: string | null) => act(async () => root.render(createElement(Probe, { reviewKey })))

  beforeEach(() => {
    vi.useFakeTimers()
    requests.length = 0
    host = document.createElement("div")
    root = createRoot(host)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    vi.useRealTimers()
  })

  it("loads, debounces one serialized PUT, and Start over deletes and clears", async () => {
    await render(KEY)
    await act(async () => Promise.resolve())
    expect(getReviewDoc(KEY)?.files["a.ts"].lines["+1"]).toBe("ok")
    act(() => setReviewDoc(KEY, withLine(getReviewDoc(KEY)!, "a.ts", "+2", "rejected")))
    await act(async () => vi.advanceTimersByTimeAsync(400))
    const put = requests.find((r) => r.init.method === "PUT")
    expect(put?.init.body).toBe(serializeDoc(getReviewDoc(KEY)!))
    await act(async () => latest.startOver())
    expect(requests.some((r) => r.init.method === "DELETE")).toBe(true)
    expect(getReviewDoc(KEY)).toBeNull()
  })

  it("aborts the old load when the key changes", async () => {
    await render(KEY)
    const signal = requests[0].signal
    await render("b".repeat(40))
    expect(signal?.aborted).toBe(true)
  })
})

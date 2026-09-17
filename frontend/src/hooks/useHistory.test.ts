// @vitest-environment jsdom
import { act, createElement, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { diagnosticsSnapshot } from "../diagnostics"
import { EngineError, type EngineClient, type RevisionDto, type RevisionFilter } from "../engine"
import { useHistory, type History } from "./useHistory"

// vitest runs under Node; the app tsconfig has no node types (layout.memory.test.ts does the same).
declare const process: {
  on(e: "unhandledRejection", f: (r: unknown) => void): void
  off(e: "unhandledRejection", f: (r: unknown) => void): void
}

// v0.16.0 review, finding 5: "A file-history reload can lose its eager-tail
// continuation after colliding with an old tail load. While file-history
// auto-pagination runs, toggle Follow renames; the new eager extension
// attaches to the old run and stops at the first 1,000 rows until the user
// scrolls." The hook is rendered for real (jsdom, no layout worker: the
// in-thread fallback lays the rows out) against a client whose pages are
// answered by hand, so a tail request can be left unresolved while the
// filter changes underneath it, the way FileHistoryView drives the hook.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PAGE = 3000 // useHistory PAGE (v0.18.15)

type Call = {
  skip: number
  filter: RevisionFilter | undefined
  signal: AbortSignal | undefined
  answer: (rows: RevisionDto[]) => void
}

function page(tag: string, from: number, count: number): RevisionDto[] {
  const id = (i: number) => `${tag}${String(i).padStart(6, "0")}`
  return Array.from({ length: count }, (_, k) => {
    const i = from + k
    return {
      id: id(i),
      parents: [id(i + 1)],
      author: "a",
      authorEmail: "a@a",
      committer: "a",
      committerEmail: "a@a",
      date: "2026-09-11T10:00:00",
      subject: `${tag} ${i}`,
      body: "",
      refs: [],
      isHead: false,
    }
  })
}

describe("useHistory: a filter change while a tail page is unresolved", () => {
  const calls: Call[] = []
  const client = {
    revisions: (_max: number, skip: number, signal?: AbortSignal, filter?: RevisionFilter) =>
      new Promise<RevisionDto[]>((resolve) => {
        // Never rejects on abort: the unresolved tail of the finding.
        calls.push({ skip, filter, signal, answer: resolve })
      }),
  } as unknown as EngineClient
  // Stable like the session's own callbacks: `extendHistory` and
  // `reloadHistory` are memoised on them, and the reset-and-reload effect
  // below re-runs whenever they change.
  const setEngineError = () => undefined
  const onFailure = (e: unknown) => String(e)
  let latest: History | null = null
  let root: Root
  let container: HTMLDivElement

  // FileHistoryView's own wiring: a new filter is a new list, reset then reloaded.
  function Harness({ filter }: { filter: RevisionFilter }) {
    const history = useHistory({ client, demo: false, live: true, setEngineError, onFailure, filter })
    latest = history
    const { resetHistory, reloadHistory } = history
    useEffect(() => {
      resetHistory()
      void reloadHistory()
    }, [resetHistory, reloadHistory])
    return null
  }

  const render = (filter: RevisionFilter) => act(async () => root.render(createElement(Harness, { filter })))
  const answer = (call: Call, rows: RevisionDto[]) =>
    act(async () => {
      call.answer(rows)
      // A macrotask later every microtask of the loader has run: its await,
      // the page's merge and the follow-up fetch it starts.
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

  beforeEach(() => {
    calls.length = 0
    latest = null
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it("starts a fresh eager tail for the new filter instead of reusing the old run", async () => {
    const follow: RevisionFilter = { path: "doc.txt", follow: true }
    const noFollow: RevisionFilter = { path: "doc.txt", follow: false }

    await render(follow)
    expect(calls.map((c) => [c.skip, c.filter])).toEqual([[0, follow]])
    await answer(calls[0], page("A", 0, PAGE))
    // A full first page: the eager extension asks for the next one at once
    // and keeps that request open.
    expect(calls.map((c) => [c.skip, c.filter])).toEqual([
      [0, follow],
      [PAGE, follow],
    ])
    expect(latest?.rows).toHaveLength(PAGE)
    expect(latest?.loadingTail).toBe(true)

    // The filter changes while that tail is unresolved.
    await render(noFollow)
    expect(calls[1].signal?.aborted).toBe(true)
    expect(calls).toHaveLength(3)
    expect([calls[2].skip, calls[2].filter]).toEqual([0, noFollow])
    expect(latest?.loadingTail).toBe(false)
    expect(latest?.loaded).toBe(false)

    // The new list's first page lands: its own eager tail must be requested
    // for the new filter, not the old run's promise handed back.
    await answer(calls[2], page("B", 0, PAGE))
    expect(latest?.loaded).toBe(true)
    expect(latest?.rows.map((r) => r.rev.id.slice(0, 1))).toEqual(Array.from({ length: PAGE }, () => "B"))
    expect(calls).toHaveLength(4)
    expect([calls[3].skip, calls[3].filter]).toEqual([PAGE, noFollow])
    expect(latest?.loadingTail).toBe(true)

    // The old tail answering late changes nothing, and does not take the
    // new run's spinner down with it.
    await answer(calls[1], page("A", PAGE, PAGE))
    expect(latest?.rows).toHaveLength(PAGE)
    expect(latest?.rows[0].rev.id.startsWith("B")).toBe(true)
    expect(latest?.loadingTail).toBe(true)
    expect(calls).toHaveLength(4)

    // The new tail completes the list.
    await answer(calls[3], page("B", PAGE, 10))
    expect(latest?.rows).toHaveLength(PAGE + 10)
    expect(latest?.rows.every((r) => r.rev.id.startsWith("B"))).toBe(true)
    expect(latest?.loadingTail).toBe(false)
    expect(calls).toHaveLength(4)
  })
})

// v0.18.9, owner (2026-09-16): "When I performed a merge, the overlay bugged
// at 'Merging' — I had to close it. Then I had an error message at the top:
// merging 'branch' history: fetch is aborted. Don't know what happened.
// Merge worked in the end, but still weird." The merge's own refresh was
// awaiting page 0 when the engine's change stream echoed the merge and the
// deferred refresh called reloadHistory again — which aborted the first
// request. The browser's AbortError ("Fetch is aborted" on WebKitGTK) then
// surfaced under the merge label. A reload never aborts a same-filter
// reload: it waits for the one in flight and runs once more after it.
describe("useHistory: a reload while one is in flight (v0.18.9)", () => {
  const calls: Call[] = []
  // Like fetch: the request rejects with the browser's AbortError when its
  // signal fires. (The describe above keeps a fake that never rejects, for
  // the tail it leaves unresolved on purpose.)
  const client = {
    revisions: (_max: number, skip: number, signal?: AbortSignal, filter?: RevisionFilter) =>
      new Promise<RevisionDto[]>((resolve, reject) => {
        calls.push({ skip, filter, signal, answer: resolve })
        signal?.addEventListener("abort", () => reject(new DOMException("Fetch is aborted", "AbortError")))
      }),
  } as unknown as EngineClient
  const setEngineError = () => undefined
  const failures: string[] = []
  const onFailure = (e: unknown, context: string) => {
    failures.push(`${context}: ${String(e)}`)
    return String(e)
  }
  let latest: History | null = null
  let root: Root
  let container: HTMLDivElement

  function Harness({ filter }: { filter: RevisionFilter }) {
    const history = useHistory({ client, demo: false, live: true, setEngineError, onFailure, filter })
    latest = history
    const { resetHistory, reloadHistory } = history
    useEffect(() => {
      resetHistory()
      void reloadHistory()
    }, [resetHistory, reloadHistory])
    return null
  }

  const render = (filter: RevisionFilter) => act(async () => root.render(createElement(Harness, { filter })))
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  const answer = async (call: Call, rows: RevisionDto[]) => {
    call.answer(rows)
    await settle()
  }
  /** Tracks a promise without awaiting it: did it settle, and how. */
  const track = (p: Promise<unknown>) => {
    const state = { settled: false, rejected: null as unknown }
    p.then(
      () => (state.settled = true),
      (e: unknown) => {
        state.settled = true
        state.rejected = e
      },
    )
    return state
  }
  const supersededReports = () =>
    diagnosticsSnapshot().filter((e) => e.source === "history" && /superseded/.test(e.message)).length

  beforeEach(() => {
    calls.length = 0
    failures.length = 0
    latest = null
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it("coalesces: the second reload waits for the first, then runs once more; nothing is aborted or rejected", async () => {
    const filter: RevisionFilter = { path: "doc.txt", follow: false }
    await render(filter)
    // The merge's refresh: page 0 in flight.
    expect(calls.map((c) => c.skip)).toEqual([0])
    // The change stream's echo: a second reload while the first awaits.
    const second = track(latest!.reloadHistory())
    await settle()
    expect(calls).toHaveLength(1)
    expect(calls[0].signal?.aborted).toBe(false)

    // The first answer is applied (short page: the list is complete, no
    // eager tail), and only then does the follow-up ask for page 0 again.
    await answer(calls[0], page("A", 0, 5))
    expect(latest?.rows.map((r) => r.rev.id)).toEqual(page("A", 0, 5).map((r) => r.id))
    expect(calls).toHaveLength(2)
    expect(calls[1].skip).toBe(0)
    expect(second.settled).toBe(false)

    // The follow-up brings the commit that landed meanwhile.
    await answer(calls[1], [...page("M", 0, 1), ...page("A", 0, 5)])
    expect(second.settled).toBe(true)
    expect(second.rejected).toBeNull()
    expect(latest?.rows.map((r) => r.rev.id)[0]).toBe("M000000")
    expect(latest?.rows).toHaveLength(6)
    expect(calls).toHaveLength(2)
    expect(calls.some((c) => c.signal?.aborted)).toBe(false)
    expect(failures).toEqual([])
  })

  it("three overlapping reloads share one follow-up", async () => {
    const filter: RevisionFilter = { path: "doc.txt", follow: false }
    await render(filter)
    const second = track(latest!.reloadHistory())
    const third = track(latest!.reloadHistory())
    await settle()
    expect(calls).toHaveLength(1)
    await answer(calls[0], page("A", 0, 5))
    expect(calls).toHaveLength(2)
    await answer(calls[1], page("A", 0, 5))
    expect(second.settled).toBe(true)
    expect(third.settled).toBe(true)
    expect(second.rejected).toBeNull()
    expect(third.rejected).toBeNull()
    expect(calls).toHaveLength(2)
  })

  it("resetHistory during a reload still aborts it; the reload resolves silently and says so in the app log", async () => {
    const filter: RevisionFilter = { path: "doc.txt", follow: false }
    await render(filter)
    const first = track(latest!.reloadHistory())
    await settle()
    const before = supersededReports()
    // A repository switch: the old page 0 is stale for good.
    await act(async () => latest!.resetHistory())
    await settle()
    expect(calls[0].signal?.aborted).toBe(true)
    expect(first.settled).toBe(true)
    expect(first.rejected).toBeNull()
    expect(supersededReports()).toBe(before + 1)
    expect(failures).toEqual([])
    expect(latest?.rows).toHaveLength(0)
  })

  it("a filter change during a reload aborts the old one and requests the new filter's page 0 at once", async () => {
    const follow: RevisionFilter = { path: "doc.txt", follow: true }
    const noFollow: RevisionFilter = { path: "doc.txt", follow: false }
    await render(follow)
    expect(calls.map((c) => [c.skip, c.filter])).toEqual([[0, follow]])

    await render(noFollow)
    await settle()
    expect(calls[0].signal?.aborted).toBe(true)
    expect(calls).toHaveLength(2)
    expect([calls[1].skip, calls[1].filter]).toEqual([0, noFollow])
    expect(calls[1].signal?.aborted).toBe(false)

    await answer(calls[1], page("B", 0, 5))
    expect(latest?.loaded).toBe(true)
    expect(latest?.rows.every((r) => r.rev.id.startsWith("B"))).toBe(true)
    expect(failures).toEqual([])
  })
})

describe("useHistory: a failed page fetch", () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it("reports 'History:' through the failure handler and never an unhandled rejection", async () => {
    const failure = vi.fn(() => "request URI too long")
    const banner = vi.fn()
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    const client = {
      revisions: () => Promise.reject(new EngineError("request URI too long", 414)),
    } as unknown as EngineClient

    function Harness() {
      const history = useHistory({ client, demo: false, live: true, setEngineError: banner, onFailure: failure })
      useEffect(() => {
        void history.reloadHistory()
      }, [history])
      return null
    }

    try {
      await act(async () => {
        root.render(createElement(Harness))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(failure).toHaveBeenCalledWith(expect.any(EngineError), "history")
      expect(banner).toHaveBeenCalledWith(expect.stringContaining("History:"))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off("unhandledRejection", unhandled)
    }
  })
})

// @vitest-environment jsdom
import { act, createElement, useReducer, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { EngineClient, MergeOptions, RepoStatus, RevisionDto } from "../engine"
import { describeThrown } from "../engine"
import { sessionReducer, sessionView, type SessionPhase } from "../session/state"
import { useDialogs } from "./useDialogs"
import type { EngineSession } from "./useEngineSession"
import { useHistory } from "./useHistory"
import { useJobs } from "./useJobs"
import { useOperationActions } from "./useOperationActions"
import { useRepoState } from "./useRepoState"

// v0.18.9, owner (2026-09-16): "When I performed a merge, the overlay bugged
// at 'Merging' — I had to close it. Then I had an error message at the top:
// merging 'branch' history: fetch is aborted. Don't know what happened.
// Merge worked in the end, but still weird."
//
// The timeline, replayed against the real hooks (history, repo state, jobs,
// operations) with a client answered by hand and fake timers for the change
// stream's echo delay:
//   1. Merge → engine.merge answers → the merge's refresh asks for page 0,
//      which takes seconds on a big repository; the dialog awaits it.
//   2. git's writes reach /events; the echo is deferred past the mute and
//      refresh() runs again → reloadHistory aborted the merge's page 0.
//   3. That refresh rejected with the browser's AbortError, useRepoState
//      prefixed "history: ", withBusy prefixed the label: the owner's line.
// Wanted: the merge's promise resolves when git has answered (the dialog
// closes), the refresh runs on behind the top bar, and a reload never
// aborts a same-filter reload.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Call = { skip: number; signal: AbortSignal | undefined; answer: (rows: RevisionDto[]) => void }

function rev(id: string, parents: string[], subject: string): RevisionDto {
  return {
    id,
    parents,
    author: "a",
    authorEmail: "a@a",
    committer: "a",
    committerEmail: "a@a",
    date: "2026-09-16T10:00:00",
    subject,
    body: "",
    refs: [],
    isHead: false,
  }
}

const status = (state: RepoStatus["state"] = "none"): RepoStatus => ({
  branch: "main",
  unstagedCount: 0,
  stagedCount: 0,
  unstaged: [],
  staged: [],
  ahead: null,
  behind: null,
  upstream: null,
  state,
  operation: null,
  conflicts: [],
})

const BASE = [rev("a000001", ["a000002"], "main change"), rev("a000002", [], "base")]
const MERGED = [rev("m000000", ["a000001", "t000001"], "Merge branch 'topic'"), ...BASE]

class FakeEventSource {
  static instances: FakeEventSource[] = []
  onmessage: ((e: { data: string }) => void) | null = null
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  close() {}
}

type Latest = {
  merge: (o: MergeOptions) => Promise<void>
  rows: string[]
  engineError: string | null
  busy: boolean
  busyLabel: string | null
  refreshing: boolean
}

describe("merge: the dialog closes when git answers and the refresh runs behind the top bar (v0.18.9)", () => {
  const calls: Call[] = []
  let mergeAnswer: { resolve: (s: RepoStatus) => void; reject: (e: unknown) => void } | null = null
  let refsFail: Error | null = null
  const client = {
    hasRepo: true,
    repoId: "r1",
    lastChangeVersion: 4,
    eventsUrl: () => "http://engine/repos/r1/events",
    revisions: (_max: number, skip: number, signal?: AbortSignal) =>
      new Promise<RevisionDto[]>((resolve, reject) => {
        calls.push({ skip, signal, answer: resolve })
        // Like fetch: the browser's AbortError when the signal fires.
        signal?.addEventListener("abort", () => reject(new DOMException("Fetch is aborted", "AbortError")))
      }),
    refs: () =>
      refsFail ? Promise.reject(refsFail) : Promise.resolve({ branches: [], remotes: [], tags: [], submodules: [] }),
    status: () => Promise.resolve(status()),
    stashes: () => Promise.resolve([]),
    recents: () => Promise.resolve([]),
    merge: () =>
      new Promise<RepoStatus>((resolve, reject) => {
        mergeAnswer = { resolve, reject }
      }),
  } as unknown as EngineClient

  let latest: Latest | null = null
  let root: Root
  let container: HTMLDivElement

  const ready: SessionPhase = {
    phase: "ready",
    health: { engine: "test", status: "ok", gitPath: "git", gitVersion: "2" },
    repo: { name: "r", root: "/r", branch: "main", id: "r1" },
  }

  // Stable like the session's own callbacks (history-paging.md: the hooks
  // memoise on them, and the change-stream effect re-subscribes — and
  // forgets its first message — whenever refresh changes identity).
  const handleFailure = (e: unknown) => describeThrown(e)
  const setRecents = () => undefined
  const openRepo = () => Promise.reject(new Error("not in this test"))

  // App.tsx's wiring of the four hooks, without the components.
  function Harness() {
    const [state, dispatch] = useReducer(sessionReducer, ready)
    const view = sessionView(state)
    const [engineError, setEngineError] = useState<string | null>(null)
    const session = {
      client,
      view,
      setEngineError,
      setRecents,
      handleFailure,
      openRepo,
      demo: false,
    } as unknown as EngineSession
    const history = useHistory({ client, demo: false, live: true, setEngineError, onFailure: handleFailure })
    const repoState = useRepoState({ session, history })
    const jobs = useJobs({
      client,
      dispatch,
      busy: view.busy,
      setEngineError,
      refresh: repoState.refresh,
      handleFailure,
    })
    const dialogs = useDialogs()
    const actions = useOperationActions({ session, repoState, jobs, dialogs, notes: { setNote: () => undefined } })
    latest = {
      merge: actions.merge,
      rows: history.rows.map((r) => r.rev.id),
      engineError,
      busy: view.busy,
      busyLabel: view.busyLabel,
      refreshing: repoState.refreshing,
    }
    return null
  }

  const flush = () => act(() => vi.advanceTimersByTimeAsync(0))
  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
  const track = (p: Promise<unknown>) => {
    const state = { settled: false }
    p.then(
      () => (state.settled = true),
      () => (state.settled = true),
    )
    return state
  }
  const events = () => FakeEventSource.instances[FakeEventSource.instances.length - 1]

  async function boot() {
    await act(async () => root.render(createElement(Harness)))
    await flush()
    expect(calls.map((c) => c.skip)).toEqual([0])
    calls[0].answer(BASE)
    await flush()
    expect(latest?.rows).toEqual(BASE.map((r) => r.id))
    expect(latest?.refreshing).toBe(false)
    // The change stream's first message is the snapshot: nothing changed.
    events().onmessage?.({ data: "4" })
    // Past the echo mute of the boot refresh.
    await advance(1000)
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
    calls.length = 0
    mergeAnswer = null
    refsFail = null
    latest = null
    FakeEventSource.instances = []
    vi.stubGlobal("EventSource", FakeEventSource)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("the owner's timeline: no 'Merging topic: history: Fetch is aborted', and the dialog closes on git's answer", async () => {
    await boot()

    const merging = track(
      latest!.merge({ branch: "topic", ff: "allow", squash: false, message: null, autostash: false, noCommit: false }),
    )
    await flush()
    expect(latest?.busyLabel).toBe("Merging topic")
    expect(merging.settled).toBe(false)

    // 1. git is done; the merge's refresh asks for page 0 — slow.
    mergeAnswer!.resolve(status())
    await flush()
    expect(calls.map((c) => c.skip)).toEqual([0, 0])
    // The dialog closes now: the merge's promise resolved with git's answer,
    // not with the end of the refresh.
    expect(merging.settled).toBe(true)
    // The refresh runs on under the top bar.
    expect(latest?.busy).toBe(true)
    expect(latest?.refreshing).toBe(true)

    // 2. Page 0 lands with the merge commit. Its header says the refresh
    // saw the watcher write, so the deferred echo is dropped rather than
    // fetching the same page a third time (v0.18.18).
    client.lastChangeVersion = 10
    calls[1].answer(MERGED)
    await flush()
    expect(latest?.rows[0]).toBe("m000000")

    // 3. The watcher can publish after that refresh completes (its 500 ms
    // polling cadence is independent of the request). This is the echo the
    // old mute deferred into a duplicate third page-0 fetch.
    events().onmessage?.({ data: "10" }) // 0b1010: refs
    await advance(1000)
    expect(calls).toHaveLength(2)
    await flush()
    expect(latest?.rows).toEqual(MERGED.map((r) => r.id))
    expect(latest?.engineError).toBeNull()
    expect(latest?.refreshing).toBe(false)
    expect(latest?.busy).toBe(false)
  })

  it("a refresh that fails after the merge says so under its own name, not the merge's", async () => {
    await boot()
    const merging = track(
      latest!.merge({ branch: "topic", ff: "allow", squash: false, message: null, autostash: false, noCommit: false }),
    )
    await flush()
    refsFail = new Error("refs broke")
    mergeAnswer!.resolve(status())
    await flush()
    expect(merging.settled).toBe(true)
    calls[1].answer(MERGED)
    await flush()
    expect(latest?.engineError).toBe("Refresh after merging topic: refs: refs broke")
    expect(latest?.busy).toBe(false)
  })

  it("an operation confirmed while the previous one's refresh runs waits for it instead of being dropped", async () => {
    await boot()
    const first = track(
      latest!.merge({ branch: "topic", ff: "allow", squash: false, message: null, autostash: false, noCommit: false }),
    )
    await flush()
    mergeAnswer!.resolve(status())
    await flush()
    expect(first.settled).toBe(true)
    expect(latest?.busyLabel).toBe("Merging topic")

    // The toolbar's dialogs open while the bar is busy: a second operation
    // confirmed now must not vanish into withBusy's busy guard.
    mergeAnswer = null
    const second = track(
      latest!.merge({ branch: "other", ff: "allow", squash: false, message: null, autostash: false, noCommit: false }),
    )
    await flush()
    expect(second.settled).toBe(false)
    expect(mergeAnswer).toBeNull()
    expect(latest?.busyLabel).toBe("Merging topic")

    // The first refresh lands: the second operation starts.
    calls[1].answer(MERGED)
    await flush()
    expect(latest?.busyLabel).toBe("Merging other")
    expect(mergeAnswer).not.toBeNull()
    mergeAnswer!.resolve(status())
    await flush()
    expect(second.settled).toBe(true)
    expect(calls).toHaveLength(3)
    calls[2].answer(MERGED)
    await flush()
    expect(latest?.busy).toBe(false)
    expect(latest?.engineError).toBeNull()
  })

  it("a merge git refuses is still the merge's error, and no refresh runs", async () => {
    await boot()
    const merging = track(
      latest!.merge({ branch: "topic", ff: "only", squash: false, message: null, autostash: false, noCommit: false }),
    )
    await flush()
    mergeAnswer!.reject(new Error("Merge failed. fatal: Not possible to fast-forward, aborting."))
    await flush()
    expect(merging.settled).toBe(true)
    expect(latest?.engineError).toBe("Merging topic: Merge failed. fatal: Not possible to fast-forward, aborting.")
    expect(calls).toHaveLength(1)
    expect(latest?.busy).toBe(false)
  })
})

// @vitest-environment jsdom
import { act, createElement, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { EngineClient, RevisionDto, RevisionFilter } from "../engine"
import { useHistory, type History } from "./useHistory"

// v0.16.0 review, finding 5: "A file-history reload can lose its eager-tail
// continuation after colliding with an old tail load. While file-history
// auto-pagination runs, toggle Follow renames; the new eager extension
// attaches to the old run and stops at the first 1,000 rows until the user
// scrolls." The hook is rendered for real (jsdom, no layout worker: the
// in-thread fallback lays the rows out) against a client whose pages are
// answered by hand, so a tail request can be left unresolved while the
// filter changes underneath it, the way FileHistoryView drives the hook.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PAGE = 1000

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

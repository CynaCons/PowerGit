import { useCallback, useEffect, useRef, useState } from "react"
import type { EngineClient, GitLogEntry } from "../engine"
import { mergeEntries, notableFailure } from "../components/gitLogModel"

// Feeds the Git console (v0.15.1). The engine deliberately does NOT bump its
// change stream when it records a command: /events drives a full refresh in
// useRepoState, and a refresh runs git commands, which would record more
// entries and refresh again — a loop. So the console polls instead, and the
// poll asks for a delta (`?after=<id>`), so a quiet session costs one tiny
// request per interval.
//
// Open: 2 s, because the panel is on screen and the user is watching it.
// Closed: 10 s, because the dock line still shows the last command.
// Hidden window: nothing at all.

export const GIT_LOG_POLL_OPEN_MS = 2_000
export const GIT_LOG_POLL_CLOSED_MS = 10_000

export type GitLogFeed = {
  /** Oldest first, capped like the engine's buffer. */
  entries: GitLogEntry[]
  /** Newest entry, or null before the first poll answers. */
  last: GitLogEntry | null
  /** Newest failure not yet dismissed — what the corner card shows. */
  failure: GitLogEntry | null
  dismissFailure: () => void
  /** Poll now: after an action, or when the panel opens. */
  refresh: () => void
}

export function useGitLog({ client, live, open }: { client: EngineClient; live: boolean; open: boolean }): GitLogFeed {
  const [entries, setEntries] = useState<GitLogEntry[]>([])
  const [failure, setFailure] = useState<GitLogEntry | null>(null)
  // The highest id already held, in a ref so an arriving entry does not
  // restart the poll effect.
  const seen = useRef<number | null>(null)
  const dismissed = useRef(0)
  const pollNow = useRef<() => void>(() => {})
  const repoId = client.repoId

  // A different repository is a different buffer: start empty.
  useEffect(() => {
    seen.current = null
    dismissed.current = 0
    setEntries([])
    setFailure(null)
  }, [repoId])

  useEffect(() => {
    if (!live || !client.hasRepo) {
      pollNow.current = () => {}
      return
    }
    let cancelled = false
    const ctrl = new AbortController()

    const poll = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      try {
        const delta = await client.gitLog(seen.current ?? undefined, ctrl.signal)
        if (cancelled || delta.length === 0) return
        seen.current = delta[delta.length - 1].id
        setEntries((current) => mergeEntries(current, delta))
        // Newest failure in the delta wins; one card at a time.
        const worst = [...delta].reverse().find(notableFailure)
        if (worst && worst.id > dismissed.current) setFailure(worst)
      } catch {
        // The console is a convenience. A failed or aborted poll must never
        // surface as an error banner, and must not stop the interval.
      }
    }

    pollNow.current = () => void poll()
    void poll()
    const timer = window.setInterval(() => void poll(), open ? GIT_LOG_POLL_OPEN_MS : GIT_LOG_POLL_CLOSED_MS)
    return () => {
      cancelled = true
      ctrl.abort()
      window.clearInterval(timer)
    }
  }, [client, live, open])

  const dismissFailure = useCallback(() => {
    setFailure((f) => {
      if (f) dismissed.current = f.id
      return null
    })
  }, [])

  const refresh = useCallback(() => pollNow.current(), [])

  return {
    entries,
    last: entries.length > 0 ? entries[entries.length - 1] : null,
    failure,
    dismissFailure,
    refresh,
  }
}

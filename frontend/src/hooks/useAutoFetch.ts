import { useEffect, useRef } from "react"
import { report } from "../diagnostics"
import { describeThrown, type EngineClient, type RepoStatus } from "../engine"
import { useBehaviour } from "../theme/behaviour"

// Background fetch (v0.15.0 settings): every N minutes, ask the default
// remote what it has, so ahead/behind is not a lie by the time you look.
// Deliberately quiet: it takes no busy indicator, raises no error banner,
// and never runs while the user's own work is in flight — a fetch that
// collides with a push would take the engine's write gate and answer 409.

export const MINUTE_MS = 60_000

export type AutoFetchDeps = {
  client: EngineClient
  live: boolean
  busy: boolean
  status: RepoStatus | null
  defaultRemote: string
  refresh: (scope?: { revisions?: boolean; refs?: boolean; status?: boolean }) => Promise<void>
}

/** True when a background fetch would be unwelcome right now. */
export function shouldSkipFetch(input: {
  live: boolean
  busy: boolean
  hidden: boolean
  state: RepoStatus["state"]
}): boolean {
  if (!input.live || input.busy || input.hidden) return true
  // Mid-merge or mid-rebase the user is reading conflicts; a refresh under
  // them is noise at best.
  return input.state !== undefined && input.state !== "none"
}

export function useAutoFetch({ client, live, busy, status, defaultRemote, refresh }: AutoFetchDeps) {
  const { autoFetchMinutes } = useBehaviour()
  // The interval must not restart every time `busy` or `status` changes, so
  // the conditions are read through a ref at fire time.
  const latest = useRef({ client, live, busy, status, defaultRemote, refresh })
  latest.current = { client, live, busy, status, defaultRemote, refresh }
  const running = useRef(false)

  useEffect(() => {
    if (autoFetchMinutes <= 0) return
    const tick = async () => {
      const now = latest.current
      const hidden = typeof document !== "undefined" && document.visibilityState === "hidden"
      if (running.current) return
      if (shouldSkipFetch({ live: now.live, busy: now.busy, hidden, state: now.status?.state })) return
      if (!now.client.hasRepo) return
      running.current = true
      try {
        const started = await now.client.startFetch(now.defaultRemote)
        await now.client.waitJob(started.id)
        await now.refresh({ revisions: true, refs: true, status: true })
      } catch (e) {
        // A background fetch that fails is a log line, not a banner: the
        // user did not ask for it and may well be offline.
        report("warn", "autofetch", describeThrown(e))
      } finally {
        running.current = false
      }
    }
    const timer = window.setInterval(() => void tick(), autoFetchMinutes * MINUTE_MS)
    return () => window.clearInterval(timer)
  }, [autoFetchMinutes])
}

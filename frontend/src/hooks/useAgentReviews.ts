import { useCallback, useEffect, useRef, useState } from "react"
import type { AgentReviewSummary, EngineClient } from "../engine"
import { listAgentReviews } from "../engine/agentReviews"

// The agent-review inbox (v0.20.0): the list behind the rail badge, polled
// every 5 s while the app runs. A poll that brings the same list sets no
// state: App must not re-render every 5 s for nothing (v0.18.18's
// reactivity review counted every App render as ~60 row renders before
// the amplifier was fixed; a poll is exactly the kind of tick that was
// meant to stay silent).

export function useAgentReviews({ engine }: { engine: EngineClient }) {
  const [sessions, setSessions] = useState<AgentReviewSummary[]>([])
  const [badge, setBadge] = useState(0)
  const [loading, setLoading] = useState(true)
  const ctrl = useRef<AbortController | null>(null)
  const seen = useRef("")
  const refresh = useCallback(async () => {
    ctrl.current?.abort()
    const next = new AbortController()
    ctrl.current = next
    try {
      const value = await listAgentReviews(engine, next.signal)
      if (!next.signal.aborted) {
        const key = JSON.stringify(value.sessions)
        if (key !== seen.current) {
          seen.current = key
          setSessions(value.sessions)
        }
        setBadge((b) => (b === value.badge ? b : value.badge))
      }
    } catch {
      // The inbox is ambient chrome: retain the last successful value.
    } finally {
      if (!next.signal.aborted) setLoading(false)
    }
  }, [engine])
  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => {
      window.clearInterval(timer)
      ctrl.current?.abort()
    }
  }, [refresh])
  return { sessions, badge, refresh, loading }
}

import { useCallback, useEffect, useRef, useState } from "react"
import type { AgentReviewSummary, EngineClient } from "../engine"
import { listAgentReviews } from "../engine/agentReviews"

export function useAgentReviews({ engine }: { engine: EngineClient }) {
  const [sessions, setSessions] = useState<AgentReviewSummary[]>([])
  const [badge, setBadge] = useState(0)
  const [loading, setLoading] = useState(true)
  const ctrl = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    ctrl.current?.abort()
    const next = new AbortController()
    ctrl.current = next
    try {
      const value = await listAgentReviews(engine, next.signal)
      if (!next.signal.aborted) {
        setSessions(value.sessions)
        setBadge(value.badge)
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

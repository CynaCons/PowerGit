import { useCallback, useEffect, useRef, useState } from "react"
import type { AgentReview, EngineClient } from "../engine"
import { getAgentReview } from "../engine/agentReviews"

// One agent review, read again every 2.5 s while it is open (v0.21.3): the
// agent's next round, its replies and a close arrive without a click. A read
// that brings the same session sets no state.

const POLL_MS = 2500

export function useAgentReviewSession(engine: EngineClient, id: string | null) {
  const [session, setSession] = useState<AgentReview | null>(null)
  const seen = useRef("")
  const reload = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return
      try {
        const value = await getAgentReview(engine, id, signal)
        if (signal?.aborted) return
        const key = JSON.stringify(value)
        if (key !== seen.current) {
          seen.current = key
          setSession(value)
        }
      } catch {
        // Keep the last good copy; the next poll tries again.
      }
    },
    [engine, id],
  )
  useEffect(() => {
    seen.current = ""
    setSession(null)
    if (!id) return
    const ctrl = new AbortController()
    void reload(ctrl.signal)
    const timer = window.setInterval(() => void reload(ctrl.signal), POLL_MS)
    return () => {
      ctrl.abort()
      window.clearInterval(timer)
    }
  }, [id, reload])
  return { session, reload: () => reload() }
}

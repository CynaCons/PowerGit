import { useCallback, useEffect, useRef, useState } from "react"
import type { AgentReviewBoard, BoardMessage, EngineClient } from "../engine"
import { agentReviewBoard, postAgentReviewBoard } from "../engine/agentReviews"

// The review's powerboard channel (v0.21.3, docs/design/agent-review-rounds.md
// §4): read every 1.5 s after the last message seen, so a long channel is
// fetched once. A new message from the agent calls `onAgentMessage` (the
// session re-reads: the engine copied a reply onto its thread).

const POLL_MS = 1500

export type BoardState = Omit<AgentReviewBoard, "messages"> & { messages: BoardMessage[]; loaded: boolean }

const EMPTY: BoardState = {
  available: false,
  channel: null,
  reason: null,
  messages: [],
  agent: null,
  lastRead: null,
  reading: false,
  loaded: false,
}

export function useAgentReviewBoard(engine: EngineClient, id: string | null, onAgentMessage?: () => void) {
  const [board, setBoard] = useState<BoardState>(EMPTY)
  const after = useRef(0)
  const notify = useRef(onAgentMessage)
  notify.current = onAgentMessage
  const poll = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return
      try {
        const value = await agentReviewBoard(engine, id, after.current, signal)
        if (signal?.aborted) return
        const fresh = value.messages.filter((m) => m.id > after.current)
        if (fresh.length > 0) after.current = fresh[fresh.length - 1].id
        setBoard((b) => {
          const same =
            b.loaded &&
            fresh.length === 0 &&
            b.available === value.available &&
            b.lastRead === value.lastRead &&
            b.reading === value.reading &&
            b.reason === value.reason
          return same ? b : { ...value, messages: [...b.messages, ...fresh], loaded: true }
        })
        if (fresh.some((m) => m.author !== "human" && m.author !== "powergit")) notify.current?.()
      } catch {
        // The board is optional: keep what is shown.
      }
    },
    [engine, id],
  )
  useEffect(() => {
    after.current = 0
    setBoard(EMPTY)
    if (!id) return
    const ctrl = new AbortController()
    void poll(ctrl.signal)
    const timer = window.setInterval(() => void poll(ctrl.signal), POLL_MS)
    return () => {
      ctrl.abort()
      window.clearInterval(timer)
    }
  }, [id, poll])
  const post = useCallback(
    async (text: string) => {
      if (!id || !text.trim()) return
      await postAgentReviewBoard(engine, id, text.trim())
      await poll()
    },
    [engine, id, poll],
  )
  return { board, post, refresh: () => poll() }
}

import { useEffect, useState } from "react"
import type { AgentReview, AgentReviewFile, EngineClient } from "../engine"

/**
 * The new side of one file of an agent review (v0.21.8), for the context
 * lines and Full file of the review screen (agentReviews/roundContext.ts):
 * the head commit's blob, or the file on disk for a working-tree review.
 * Null for a deleted or added file (the patch already holds every line), a
 * review without either, a binary or cut file, or a failed read. `settled`
 * turns true once the answer is in.
 */
export function useRoundSource(
  engine: EngineClient,
  session: AgentReview,
  file: AgentReviewFile | undefined,
  /** Changes when the round does: a working-tree file is read again. */
  round: number,
): { text: string | null; settled: boolean } {
  const path = file && (file.status === "M" || file.status === "R" || file.status === "T") ? file.path : null
  const from = session.worktree ? "worktree" : session.head
  const key = path && from ? `${session.id}|${round}|${from}|${path}` : null
  const [state, setState] = useState<{ key: string; text: string | null } | null>(null)
  useEffect(() => {
    if (!key || !path || !from) return
    const ctrl = new AbortController()
    const read =
      from === "worktree" ? engine.workTreeBlob(path, false, ctrl.signal) : engine.blob(from, path, ctrl.signal)
    read.then(
      (dto) => setState({ key, text: dto.binary || dto.truncated ? null : dto.text }),
      () => {
        if (!ctrl.signal.aborted) setState({ key, text: null })
      },
    )
    return () => ctrl.abort()
  }, [engine, key, path, from])
  if (key === null) return { text: null, settled: true }
  return state?.key === key ? { text: state.text, settled: true } : { text: null, settled: false }
}

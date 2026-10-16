import { useMemo } from "react"
import type { AgentReviewThread, EngineClient } from "../../engine"
import { askAgentReview, withdrawAgentReviewComment } from "../../engine/agentReviews"
import { updateReviewDoc } from "../../review/reviewState"
import { withComment, withCommentText, withoutComment } from "../../review/reviewModel"
import type { CommentKind } from "./RoundThread"

// The owner's comments on a round (v0.21.3; v0.21.12 owner: "when I'm
// dropping a comment in the review panel, it is not deletable"). A comment
// lives in the round's review file until the round is sent, so it can be
// edited or deleted there; a question asked on the board is also an engine
// thread, so taking it back withdraws the thread (the board says "cN
// withdrawn") and drops it from the file, or the round would carry it.

export type CommentEdits = {
  /** Change the text of the line's index-th comment. */
  edit: (line: string, index: number, text: string) => void
  /** Delete the line's index-th comment from the review file. */
  remove: (line: string, index: number) => void
  /** Withdraw an asked question; index is its review-file comment, if any. */
  withdraw: (thread: AgentReviewThread, index: number | null) => void
}

export function useRoundComments({
  engine,
  sessionId,
  round,
  reviewKey,
  path,
  run,
  finish,
  onSaved,
}: {
  engine: EngineClient
  sessionId: string
  round: number
  reviewKey: string
  path: string
  run: (work: () => Promise<unknown>) => Promise<void>
  finish: () => Promise<unknown>
  onSaved: () => void
}) {
  const add = (line: string, text: string, kind: CommentKind) => {
    updateReviewDoc(reviewKey, (d) => withComment(d, path, line, text))
    onSaved()
    if (kind === "ask")
      void run(async () => {
        await finish()
        await askAgentReview(engine, sessionId, { round, path, line, body: text })
      })
  }
  const edits: CommentEdits = useMemo(() => {
    const remove = (line: string, index: number) =>
      updateReviewDoc(reviewKey, (d) => withoutComment(d, path, line, index))
    return {
      edit: (line, index, text) =>
        text.trim() && updateReviewDoc(reviewKey, (d) => withCommentText(d, path, line, index, text.trim())),
      remove,
      withdraw: (thread, index) => {
        if (index !== null) remove(thread.line, index)
        void run(async () => {
          await finish()
          await withdrawAgentReviewComment(engine, sessionId, thread.id)
        })
      },
    }
  }, [engine, finish, path, reviewKey, run, sessionId])
  return { add, edits }
}

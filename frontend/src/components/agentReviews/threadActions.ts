import type { AgentReviewThread } from "../../engine"
import type { RoundDiffProps } from "./RoundDiff"
import type { ThreadActions } from "./RoundThread"

// What the owner can do with a comment's conversation in the round being
// viewed: v0.21.12 edit / delete / withdraw while the round is open, v0.21.13
// reply on the board while the review is open, v0.21.14 dismiss a reviewer
// agent's comment before the round goes to the author.

/** A comment not sent yet is edited or deleted; a question already asked is withdrawn. */
export function commentActions(
  p: RoundDiffProps,
  line: string,
  thread: AgentReviewThread | null,
  index: number | null,
): ThreadActions | null {
  const edits = p.edits
  if (!p.editable || !edits) return null
  if (thread === null && index !== null)
    return { edit: (text) => edits.edit(line, index, text), remove: () => edits.remove(line, index) }
  if (thread?.kind === "ask") return { withdraw: () => edits.withdraw(thread, index) }
  if (thread?.author && thread.kind === "round" && thread.round === p.round.n)
    return { dismiss: () => edits.withdraw(thread, null) }
  return null
}

/** A reply goes on the board, so it needs one (and an open review). */
export function replyProps(p: RoundDiffProps, thread: AgentReviewThread | null) {
  if (!thread) return {}
  const onReply = p.onReply
  return onReply
    ? { onReply: (body: string) => onReply(thread, body) }
    : { onReply: null, replyOff: p.replyOff ?? null }
}

/** The owner's comments on a line from the review file, and the questions whose file comment is gone. */
export function lineComments(p: RoundDiffProps, line: string) {
  const comments = p.doc?.files[p.path]?.comments.filter((c) => c.line === line) ?? []
  const loose = p.threads.filter(
    (t) => t.round === p.round.n && t.path === p.path && t.line === line && !comments.some((c) => c.text === t.body),
  )
  return { comments, loose }
}

import type { AgentReviewThread } from "../../engine"
import type { RoundDiffProps } from "./RoundDiff"
import type { ThreadActions } from "./RoundThread"

// What the owner can do with a comment's conversation in the round being
// viewed: v0.21.12 edit / delete / withdraw while the round is open, v0.21.13
// reply on the board while the review is open.

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

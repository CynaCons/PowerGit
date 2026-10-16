import type { AgentReviewThread } from "../../engine"
import type { RoundDiffProps } from "./RoundDiff"
import { threadFor } from "./roundModel"
import { Draft, Thread, ThreadItems, type ThreadActions } from "./RoundThread"

// The comments under one line of a round (v0.21.3): the owner's comments from
// the review file with the thread each became, questions asked on the board
// whose file comment is gone, and the draft. v0.21.12 (owner: "when I'm
// dropping a comment in the review panel, it is not deletable"): while the
// round is open a comment not sent yet is edited or deleted, and a question
// already asked is withdrawn.

function commentActions(
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

export function LineThreads({
  p,
  line,
  comments,
  loose,
  picked,
}: {
  p: RoundDiffProps
  line: string
  comments: { line: string; text: string }[]
  loose: AgentReviewThread[]
  picked: boolean
}) {
  return (
    <tr>
      <td colSpan={4}>
        <Thread>
          {comments.map((c, i) => {
            const thread = threadFor(p.threads, p.round.n, p.path, line, c.text)
            return (
              <ThreadItems
                key={`c${i}`}
                thread={thread}
                text={c.text}
                kind={thread?.kind ?? "round"}
                line={line}
                actions={commentActions(p, line, thread, i)}
              />
            )
          })}
          {loose.map((t) => (
            <ThreadItems
              key={t.id}
              thread={t}
              text={t.body}
              kind={t.kind}
              line={line}
              actions={commentActions(p, line, t, null)}
            />
          ))}
          {picked && (
            <Draft
              canAsk={p.canAsk}
              line={line}
              onCancel={() => p.onPick(null)}
              onSave={(text, kind) => p.onComment(line, text, kind)}
            />
          )}
        </Thread>
      </td>
    </tr>
  )
}

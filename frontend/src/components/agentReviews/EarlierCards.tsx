import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import type { AgentReviewChange, AgentReviewThread } from "../../engine"
import { Conversation } from "./Conversation"
import type { RoundDiffProps } from "./RoundDiff"
import { Chip } from "./reviewChips"
import { quotedLine } from "./roundModel"
import { Thread } from "./RoundThread"
import { replyProps } from "./threadActions"

// Under a file's changes (v0.21.3 removed cards; v0.21.13, owner: "if I drop
// a comment on round one, when the agent comes with round two, I lose the
// comments"): the changes the agent removed, each with the conversations it
// had — those removed in this round, and those removed earlier that still
// have something to say — and the conversations that never had a change. A
// file that left the round shows only this.

function Conversations({ p, threads }: { p: RoundDiffProps; threads: AgentReviewThread[] }) {
  return (
    <Thread>
      {threads.map((t) => (
        <Conversation
          key={t.id}
          thread={t}
          text={t.body}
          kind={t.kind}
          line={t.line}
          label={`Round ${t.round}, line ${t.line.slice(1)}`}
          quote={quotedLine(p.rounds, t)}
          {...replyProps(p, t)}
        />
      ))}
    </Thread>
  )
}

function RemovedCard({
  p,
  change,
  round,
  threads,
}: {
  p: RoundDiffProps
  change: AgentReviewChange
  round: number
  threads: AgentReviewThread[]
}) {
  const rejected = change.verdict === "reject"
  return (
    <Box
      data-testid="round-removed"
      data-change={change.id}
      sx={{ border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 1.5, overflow: "hidden" }}
    >
      <Box sx={{ px: 1, py: 0.75, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <Chip tone={rejected ? "accept" : "muted"}>
          {rejected ? "removed after your rejection" : "removed"}
          {round < p.round.n ? ` in round ${round}` : ""}
        </Chip>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          {change.id} · line {change.newLines > 0 ? change.newStart : change.oldStart}
        </Typography>
      </Box>
      {threads.length > 0 && <Conversations p={p} threads={threads} />}
    </Box>
  )
}

export function EarlierCards(p: RoundDiffProps & { gone?: boolean }) {
  const { path, round, earlier } = p
  const here = earlier.removed.filter((e) => e.change.path === path)
  const removedNow = p.previous
    .filter((c) => c.path === path && round.removed.includes(c.id))
    .map((c) => ({ change: c, round: round.n, threads: here.find((e) => e.change.id === c.id)?.threads ?? [] }))
  const removedBefore = here.filter((e) => !removedNow.some((r) => r.change.id === e.change.id))
  const loose = earlier.byFile.get(path) ?? []
  if (removedNow.length + removedBefore.length + loose.length === 0) return null
  return (
    <Box data-testid="round-earlier" sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
      {p.gone && (
        <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
          {path} has no changes in round {round.n}. Its conversations from earlier rounds:
        </Typography>
      )}
      {[...removedNow, ...removedBefore].map((e) => (
        <RemovedCard key={e.change.id} p={p} change={e.change} round={e.round} threads={e.threads} />
      ))}
      {loose.length > 0 && <Conversations p={p} threads={loose} />}
    </Box>
  )
}

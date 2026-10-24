import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import type { AgentReviewThread, BranchPlanConflict, BranchPlanStep } from "../../../engine"
import { Conversation } from "../Conversation"
import { fieldSx } from "../fieldSx"

// One step of the plan under the graph (v0.22.0): what git or the refs said,
// both sides of every file git merge-tree predicts will conflict, the
// commands the agent will run, and the step's conversations (the agent's
// explanation, the owner's comments, every reply) with a box to comment.

const tone = {
  ok: ["var(--pg-review-accept-bg)", "var(--pg-review-accept)"],
  conflict: ["var(--pg-review-rejected-bg)", "var(--pg-review-rejected)"],
  risk: ["var(--pg-review-rejected-bg)", "var(--pg-review-rejected)"],
  invalid: ["var(--pg-review-rejected-bg)", "var(--pg-review-rejected)"],
  unknown: ["var(--pg-review-todo-bg)", "var(--pg-review-todo)"],
} as const

function Side({ side }: { side: BranchPlanConflict["sides"][number] }) {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        overflow: "hidden",
        minWidth: 0,
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          gap: 0.75,
          alignItems: "center",
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <span className="ref">{side.label}</span>
        <Typography noWrap sx={{ fontSize: 12, color: "text.secondary" }}>
          {[side.commit, side.subject].filter(Boolean).join(" ")}
        </Typography>
      </Box>
      <Box sx={{ fontSize: 12, py: 0.25, overflowX: "auto" }}>
        {side.patch.split("\n").map((line, i) => (
          <Box
            key={i}
            sx={{
              px: 1,
              whiteSpace: "pre",
              color: line.startsWith("+")
                ? "var(--pg-diff-added)"
                : line.startsWith("-")
                  ? "var(--pg-diff-removed)"
                  : "text.secondary",
              bgcolor: line.startsWith("+")
                ? "var(--pg-diff-added-bg, rgba(24,145,0,.1))"
                : line.startsWith("-")
                  ? "var(--pg-diff-removed-bg, rgba(211,0,11,.08))"
                  : "transparent",
            }}
          >
            {line || " "}
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export function PlanDetail({
  step,
  threads,
  canComment,
  sent,
  onComment,
  onReply,
  replyOff,
}: {
  step: BranchPlanStep
  threads: AgentReviewThread[]
  /** The owner can comment while the round waits for them. */
  canComment: boolean
  /** The round went to the agent: its comments say they were sent. */
  sent: boolean
  onComment: (body: string) => Promise<void>
  onReply: ((thread: AgentReviewThread, body: string) => void) | null
  replyOff: string | null
}) {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const colors = tone[step.result]
  const send = () => {
    const body = text.trim()
    if (!body) return
    setBusy(true)
    onComment(body)
      .then(() => setText(""))
      .finally(() => setBusy(false))
  }
  return (
    <Box data-testid="plan-detail" data-step={step.n} sx={{ p: 1.5, display: "grid", gap: 1 }}>
      <Typography sx={{ fontWeight: 600, fontSize: 13.5 }}>
        {step.n}. {step.text}
      </Typography>
      <Box
        data-testid="plan-check"
        data-result={step.result}
        sx={{ px: 1.25, py: 0.75, borderRadius: 1, fontSize: 12.5, bgcolor: colors[0], color: colors[1] }}
      >
        {step.because}
      </Box>
      {(step.conflicts ?? []).map((c) => (
        <Box key={c.path} sx={{ display: "grid", gap: 0.5 }}>
          <Typography data-testid="plan-conflict-file" sx={{ fontSize: 12.5, fontWeight: 600 }}>
            {c.path}
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 1 }}>
            {c.sides.map((s) => (
              <Side key={s.label} side={s} />
            ))}
          </Box>
        </Box>
      ))}
      <Box
        component="pre"
        sx={{
          m: 0,
          px: 1.25,
          py: 0.75,
          fontSize: 12,
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "background.paper",
          whiteSpace: "pre-wrap",
          fontFamily: "inherit",
          color: "text.secondary",
        }}
      >
        {step.commands.join("\n")}
      </Box>
      {threads.length > 0 && (
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, bgcolor: "background.paper" }}>
          {threads.map((t) => (
            <Conversation
              key={t.id}
              thread={t}
              text={t.body}
              kind={t.kind}
              line={t.line}
              label={`step ${step.n}`}
              waiting={!sent}
              {...(onReply ? { onReply: (body: string) => onReply(t, body) } : { onReply: null, replyOff })}
            />
          ))}
        </Box>
      )}
      {canComment && (
        <Box sx={{ display: "grid", gap: 0.5 }}>
          <Box
            component="textarea"
            data-testid="plan-comment-text"
            value={text}
            placeholder={`Comment on step ${step.n}`}
            aria-label={`Comment on step ${step.n}`}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send()
            }}
            sx={{ ...fieldSx, minHeight: 44 }}
          />
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Button
              size="small"
              variant="outlined"
              data-testid="plan-comment-send"
              disabled={busy || !text.trim()}
              onClick={send}
              sx={{ textTransform: "none" }}
            >
              Comment
            </Button>
            <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
              Posted on the board at once and sent with the round. Ctrl+Enter sends.
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  )
}

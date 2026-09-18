import Box from "@mui/material/Box"
import Chip from "@mui/material/Chip"
import Typography from "@mui/material/Typography"
import type { AgentReviewSummary } from "../../engine"
import { ageOf, statusLabel } from "./agentReviewModel"

export function StatusChip({ status }: { status: AgentReviewSummary["status"] }) {
  const color =
    status === "approved"
      ? "var(--pg-review-ok)"
      : status === "changes_requested"
        ? "var(--pg-review-rejected)"
        : status === "pending"
          ? "var(--pg-review-todo)"
          : "text.secondary"
  return <Chip data-testid="agent-review-status" size="small" label={statusLabel(status)} sx={{ color, height: 22 }} />
}
export function ModeChip({ mode }: { mode: AgentReviewSummary["mode"] }) {
  return (
    <Chip
      data-testid="agent-review-mode"
      size="small"
      label={mode === "wait" ? "Wait" : "Notify"}
      sx={{ height: 22, color: mode === "wait" ? "var(--pg-review-todo)" : "text.secondary" }}
    />
  )
}
export function AgentReviewList({
  sessions,
  onOpen,
}: {
  sessions: AgentReviewSummary[]
  onOpen: (id: string) => void
}) {
  if (!sessions.length)
    return (
      <Typography color="text.secondary" sx={{ p: 3 }}>
        No agent reviews. An agent opens one over MCP when it wants your eyes on a change.
      </Typography>
    )
  return (
    <Box sx={{ overflow: "auto" }}>
      {sessions.map((s) => (
        <Box
          key={s.id}
          component="button"
          data-testid="agent-review-row"
          data-status={s.status}
          data-mode={s.mode}
          onClick={() => onOpen(s.id)}
          sx={{
            width: "100%",
            border: 0,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "transparent",
            color: "text.primary",
            textAlign: "left",
            p: 1.5,
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            gap: 1,
            cursor: "pointer",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <Box>
            <Typography sx={{ fontWeight: 600 }}>
              {s.unread && s.mode === "notify" ? "• " : ""}
              {s.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {[s.agent, s.branch].filter(Boolean).join(" · ") || "Unknown agent"}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
            <ModeChip mode={s.mode} />
            <StatusChip status={s.status} />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
            {s.fileCount} {s.fileCount === 1 ? "file" : "files"} · {ageOf(s.updatedAt)}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

import Chip from "@mui/material/Chip"
import type { AgentReviewSummary } from "../../engine"
import { statusLabel } from "./agentReviewModel"

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

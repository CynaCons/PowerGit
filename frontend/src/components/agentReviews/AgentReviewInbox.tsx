import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import RefreshIcon from "@mui/icons-material/Refresh"
import CloseIcon from "@mui/icons-material/Close"
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined"
import BlockIcon from "@mui/icons-material/Block"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import { describeThrown } from "../../engine"
import type { AgentReviewEverywhereItem } from "../../engine"
import { paneSx, deskGap } from "../../theme/panels"
import { ageOf } from "./agentReviewModel"
import { Chip } from "./reviewChips"
import { CancelReviewDialog } from "./CancelReviewDialog"
import { filterReviews, onBoard, turnLabel, waitingForYou, type InboxFilter } from "./roundModel"

// The agent reviews, full view (v0.21.3, tab "Inbox" of
// docs/prototypes/agent-review-v3.html): one row per review — title, mode,
// agent, branch, files, whether the agent is on the board, whose turn it is,
// age. The filter starts on what waits for the owner. Since v0.21.10 the
// inbox holds every open repository's reviews, and each row names the
// repository it lives in (`data-testid="agent-review-repo"`, plain words).
// v0.22.9: a finished row is dismissed from its right end; dismissed reviews
// have their own filter. v0.22.10: a pending row is cancelled there instead,
// with an optional message the agent receives.

export function AgentReviewInbox({
  sessions,
  openError,
  onOpen,
  onDismissError,
  onDismiss,
  onCancel,
  onRefresh,
  onClose,
}: {
  sessions: AgentReviewEverywhereItem[]
  openError: string | null
  onOpen: (item: AgentReviewEverywhereItem) => void
  onDismissError?: () => void
  onDismiss?: (item: AgentReviewEverywhereItem) => Promise<void>
  onCancel?: (item: AgentReviewEverywhereItem, message: string) => Promise<void>
  onRefresh: () => void
  onClose: () => void
}) {
  const summaries = sessions.map((i) => i.session)
  const waiting = summaries.filter(waitingForYou).length
  const [filter, setFilter] = useState<InboxFilter>(waiting > 0 ? "waiting" : "open")
  // The engine orders the rows newest first; the filter only drops some.
  const keptIds = new Set(filterReviews(summaries, filter).map((s) => s.id))
  const shown = sessions.filter((i) => keptIds.has(i.session.id))
  const [dismissError, setDismissError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<AgentReviewEverywhereItem | null>(null)
  const dismiss = (item: AgentReviewEverywhereItem) => {
    setDismissError(null)
    onDismiss?.(item).catch((e) => setDismissError(`Could not dismiss: ${describeThrown(e)}`))
  }
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: deskGap }}>
      <Box sx={{ ...paneSx, px: 1.5, py: 1, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ fontWeight: 600 }}>Agent reviews</Typography>
        {waiting > 0 && <Chip tone="wait">{waiting} waiting for you</Chip>}
        <Box sx={{ flex: 1 }} />
        {(
          [
            ["waiting", "Waiting for you"],
            ["open", "Open"],
            ["all", "All"],
            ["dismissed", "Dismissed"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="small"
            data-testid={`inbox-filter-${value}`}
            variant={filter === value ? "contained" : "outlined"}
            onClick={() => setFilter(value)}
            sx={{ textTransform: "none", py: 0 }}
          >
            {label}
          </Button>
        ))}
        <IconButton size="small" aria-label="Refresh agent reviews" onClick={onRefresh}>
          <RefreshIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label="Close agent reviews" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      {dismissError && (
        <Box data-testid="agent-review-dismiss-error" sx={{ ...paneSx, px: 1.5, py: 1 }}>
          <Typography sx={{ fontSize: 12, color: "error.main" }}>{dismissError}</Typography>
        </Box>
      )}
      {openError && (
        <Box
          data-testid="agent-review-open-error"
          sx={{ ...paneSx, px: 1.5, py: 1, display: "flex", alignItems: "center", gap: 1 }}
        >
          <Chip tone="reject">Could not open the repository</Chip>
          <Typography noWrap sx={{ fontSize: 12, color: "text.secondary", flex: 1, minWidth: 0 }}>
            {openError}
          </Typography>
          {onDismissError && (
            <IconButton size="small" aria-label="Dismiss the error" onClick={onDismissError}>
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      )}
      <Box sx={{ ...paneSx, flex: 1, minHeight: 0, overflow: "auto" }}>
        {shown.length === 0 && (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            {sessions.length === 0
              ? "No agent reviews. An agent opens one with agent_review_open over powergit mcp."
              : filter === "waiting"
                ? "Nothing waits for you."
                : filter === "dismissed"
                  ? "No dismissed reviews."
                  : "No open reviews."}
          </Typography>
        )}
        {shown.map((item) => {
          const s = item.session
          const turn = turnLabel(s)
          const live = s.status === "pending" && onBoard(s)
          return (
            <Box
              key={s.id}
              role="button"
              tabIndex={0}
              data-testid="agent-review-row"
              data-status={s.status}
              data-mode={s.mode}
              data-turn={s.turn ?? ""}
              data-dismissed={s.closedAt ? "true" : undefined}
              onClick={() => onOpen(item)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault()
                  onOpen(item)
                }
              }}
              sx={{
                width: "100%",
                border: 0,
                borderBottom: 1,
                borderColor: "divider",
                bgcolor: "transparent",
                color: "text.primary",
                textAlign: "left",
                px: 1.5,
                py: 1,
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 150px 200px 80px 32px",
                gap: 1.5,
                alignItems: "center",
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
                "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 600 }}>
                    {s.title}
                  </Typography>
                  <Chip tone={s.mode === "wait" ? "wait" : "info"}>{s.mode === "wait" ? "Wait" : "Notify"}</Chip>
                  <Box
                    component="span"
                    data-testid="agent-review-repo"
                    sx={{
                      border: 1,
                      borderColor: "divider",
                      borderRadius: 2.5,
                      px: 0.9,
                      fontSize: 11,
                      lineHeight: "18px",
                      whiteSpace: "nowrap",
                      color: "text.secondary",
                      flexShrink: 0,
                    }}
                  >
                    {item.repo.name}
                  </Box>
                </Box>
                <Typography noWrap sx={{ fontSize: 12, color: "text.secondary" }}>
                  {[
                    // v0.22.0: a branch plan counts its steps.
                    s.kind === "plan" ? "Branch plan" : null,
                    s.agent ?? "unknown agent",
                    s.branch,
                    s.kind === "plan"
                      ? `${s.fileCount} step${s.fileCount === 1 ? "" : "s"}`
                      : `${s.fileCount} file${s.fileCount === 1 ? "" : "s"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
                <Box
                  component="span"
                  data-testid="inbox-presence"
                  data-on={live ? "yes" : "no"}
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: live ? "var(--pg-review-accept)" : "text.disabled",
                    flexShrink: 0,
                  }}
                />
                <Typography noWrap sx={{ fontSize: 12, color: "text.secondary" }}>
                  {s.board ? (live ? "agent on the board" : "agent not reading") : "no board"}
                </Typography>
              </Box>
              <Box>
                <Chip tone={turn.tone === "ok" ? "accept" : turn.tone}>
                  <span data-testid="agent-review-turn-label">{turn.label}</span>
                </Chip>
              </Box>
              <Typography sx={{ fontSize: 12, color: "text.secondary", textAlign: "right" }}>
                {ageOf(s.updatedAt)}
              </Typography>
              {onCancel && s.status === "pending" && !s.closedAt ? (
                <IconButton
                  size="small"
                  data-testid="agent-review-cancel"
                  title="Cancel the review"
                  aria-label={`Cancel ${s.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCancelling(item)
                  }}
                >
                  <BlockIcon fontSize="small" />
                </IconButton>
              ) : onDismiss && s.status !== "pending" && !s.closedAt ? (
                <IconButton
                  size="small"
                  data-testid="agent-review-dismiss"
                  title="Dismiss"
                  aria-label={`Dismiss ${s.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    dismiss(item)
                  }}
                >
                  <ArchiveOutlinedIcon fontSize="small" />
                </IconButton>
              ) : (
                <span />
              )}
            </Box>
          )
        })}
      </Box>
      {cancelling && onCancel && (
        <CancelReviewDialog
          item={cancelling}
          onClose={() => setCancelling(null)}
          onCancel={async (message) => {
            setDismissError(null)
            try {
              await onCancel(cancelling, message)
              setCancelling(null)
            } catch (e) {
              setDismissError(`Could not cancel: ${describeThrown(e)}`)
              setCancelling(null)
            }
          }}
        />
      )}
    </Box>
  )
}

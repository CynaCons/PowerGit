import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import type { AgentReviewSummary, EngineClient } from "../../engine"
import { useAgentReviewSession } from "../../hooks/useAgentReviewSession"
import { paneSx } from "../../theme/panels"
import { AgentReviewInbox } from "./AgentReviewInbox"
import { AgentReviewSession } from "./AgentReviewSession"
import { ReviewScreen } from "./ReviewScreen"

// The agent reviews take the whole window except the rail (v0.21.3, owner
// 2026-10-13: "should we go full view instead of just the bottom panels?"):
// the inbox, or one review. A review opened before v0.21 (version 1, no
// rounds) keeps the v0.20 session view.

export function AgentReviewsView({
  engine,
  page,
  inbox,
  onClose,
}: {
  engine: EngineClient
  page: { sessionId: string | null; openSession: (id: string) => void; openList: () => void }
  inbox: { sessions: AgentReviewSummary[]; refresh: () => Promise<void> }
  onClose: () => void
}) {
  const { sessionId, openSession: onOpen, openList: onList } = page
  const { sessions, refresh } = inbox
  const { session, reload } = useAgentReviewSession(engine, sessionId)
  const changed = () => void refresh()
  return (
    <Box data-testid="agent-reviews-view" sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
      {!sessionId ? (
        <AgentReviewInbox sessions={sessions} onOpen={onOpen} onRefresh={() => void refresh()} onClose={onClose} />
      ) : !session ? (
        <Paper sx={{ ...paneSx, flex: 1, p: 3 }}>
          <Typography color="text.secondary">Loading the review…</Typography>
        </Paper>
      ) : session.rounds && session.rounds.length > 0 ? (
        <ReviewScreen
          key={session.id}
          engine={engine}
          session={session}
          reload={reload}
          onBack={onList}
          onChanged={changed}
        />
      ) : (
        <Paper sx={{ ...paneSx, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <AgentReviewSession
            session={session}
            engine={engine}
            onBack={onList}
            onResolved={() => {
              onList()
              changed()
            }}
          />
        </Paper>
      )}
    </Box>
  )
}

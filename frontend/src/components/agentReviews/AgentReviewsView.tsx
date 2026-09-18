import CloseIcon from "@mui/icons-material/Close"
import RefreshIcon from "@mui/icons-material/Refresh"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import type { AgentReview, AgentReviewSummary, EngineClient } from "../../engine"
import { getAgentReview } from "../../engine/agentReviews"
import { AgentReviewList } from "./AgentReviewList"
import { AgentReviewSession } from "./AgentReviewSession"

export function AgentReviewsView({
  engine,
  sessions,
  sessionId,
  refresh,
  onOpen,
  onList,
  onClose,
}: {
  engine: EngineClient
  sessions: AgentReviewSummary[]
  sessionId: string | null
  refresh: () => Promise<void>
  onOpen: (id: string) => void
  onList: () => void
  onClose: () => void
}) {
  const [session, setSession] = useState<AgentReview | null>(null)
  useEffect(() => {
    setSession(null)
    if (!sessionId) return
    const ctrl = new AbortController()
    void getAgentReview(engine, sessionId, ctrl.signal).then((value) => !ctrl.signal.aborted && setSession(value))
    return () => ctrl.abort()
  }, [engine, sessionId])
  const resolved = () => {
    onList()
    void refresh()
  }
  return (
    <Paper
      square
      data-testid="agent-reviews-view"
      sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <Box sx={{ height: 44, px: 1.5, display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
        <Typography sx={{ fontWeight: 600, flex: 1 }}>
          Agent reviews {sessions.length > 0 && `(${sessions.length})`}
        </Typography>
        <IconButton aria-label="Refresh agent reviews" onClick={() => void refresh()}>
          <RefreshIcon />
        </IconButton>
        <IconButton aria-label="Close agent reviews" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>
      {sessionId && session ? (
        <AgentReviewSession session={session} engine={engine} onBack={onList} onResolved={resolved} />
      ) : (
        <AgentReviewList sessions={sessions} onOpen={onOpen} />
      )}
    </Paper>
  )
}

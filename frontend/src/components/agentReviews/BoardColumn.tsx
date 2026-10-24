import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import Typography from "@mui/material/Typography"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { AgentReview, AgentReviewRound } from "../../engine"
import type { BoardState } from "../../hooks/useAgentReviewBoard"
import { AgentDisc, EventNode, LaneItem } from "./boardLane"
import { PostFeed } from "./boardPosts"
import { RoundBox, type RoundActions } from "./RoundBox"
import { presenceLabel, type RoundCounts } from "./roundModel"

// The right column of the review (v0.21.3, layout A of
// docs/prototypes/agent-review-v3.html; v0.21.12 lane design, owner: "make
// the right panel looking a bit better. Right now it's looking rough"): the
// agent and whether it is reading, the review's powerchannel channel drawn as
// one lane, a message field that posts at once, and under it the round box.
// With no powerchannel the lane lists the rounds and the agent waits in
// agent_review_wait (design decision 3).

export function BoardColumn({
  session,
  round,
  counts,
  board,
  onPost,
  onJump,
  actions,
  busy,
  footer,
}: {
  session: AgentReview
  round: AgentReviewRound
  counts: RoundCounts
  board: BoardState
  onPost: (text: string) => Promise<void>
  onJump: (commentId: string) => void
  actions: RoundActions
  busy: boolean
  /** v0.22.0: a branch plan's own box in place of the round box. */
  footer?: React.ReactNode
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const feed = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight
  }, [board.messages.length])
  const open = session.status === "pending"
  const withBoard = board.available && session.board
  const agent = board.agent ?? session.agent ?? "agent"
  return (
    <Box
      data-testid="board-column"
      data-board={withBoard ? "on" : "off"}
      // One shrinkable track: a long channel name or the message field wraps
      // inside the pane instead of widening it (the 300 px board of the
      // narrow layout). --pg-board-bg rings the lane's nodes so the line
      // stops at their edge.
      sx={(t) => ({
        "--pg-board-bg": t.palette.background.paper,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gridTemplateRows: "auto minmax(0, 1fr) auto auto",
        minHeight: 0,
        minWidth: 0,
        height: "100%",
      })}
    >
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
          display: "grid",
          gridTemplateColumns: "auto minmax(0, 1fr)",
          columnGap: 1,
          alignItems: "center",
        }}
      >
        <AgentDisc name={agent} size={28} />
        {withBoard ? (
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
              <Typography noWrap sx={{ fontWeight: 600, fontSize: 13 }}>
                {agent}
              </Typography>
              <Box
                component="span"
                data-testid="board-presence"
                data-reading={board.reading ? "yes" : "no"}
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  flexShrink: 0,
                  bgcolor: board.reading ? "var(--pg-review-accept)" : "text.disabled",
                  boxShadow: board.reading ? "0 0 0 3px var(--pg-review-accept-bg)" : "none",
                }}
              />
              <Typography noWrap sx={{ fontSize: 12, color: "text.secondary", minWidth: 0 }}>
                {open ? presenceLabel(board.lastRead, board.reading, now) : "review closed"}
              </Typography>
            </Box>
            <Typography
              data-testid="board-channel"
              noWrap
              title={`powerchannel channel ${session.board}`}
              sx={{ fontSize: 11, color: "text.secondary" }}
            >
              {session.board}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 600, fontSize: 13 }}>
              {agent}
            </Typography>
            <Typography data-testid="board-unavailable" sx={{ fontSize: 11.5, color: "text.secondary" }}>
              {session.board ? (board.reason ?? "powerchannel not available") : "powerchannel not found"}
              {session.mode === "wait" ? "; the agent waits in agent_review_wait" : ""}
            </Typography>
          </Box>
        )}
      </Box>
      <Box ref={feed} data-testid="board-feed" sx={{ overflow: "auto", px: 1.5, pt: 1.5, pb: 0.5, minWidth: 0 }}>
        {withBoard ? (
          board.messages.length > 0 ? (
            <PostFeed messages={board.messages} agent={session.agent} onJump={onJump} />
          ) : (
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>No messages yet.</Typography>
          )
        ) : (
          <>
            {(session.rounds ?? []).map((r) => (
              <LaneItem key={r.n} node={<EventNode kind={r.sentAt ? "sent" : "opened"} />}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600, lineHeight: "22px" }}>
                  Round {r.n} {r.sentAt ? "sent" : "opened"}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
                  {r.plan ? (
                    // v0.22.0: a branch plan's round counts its steps.
                    `${r.plan.steps.length} step${r.plan.steps.length === 1 ? "" : "s"}`
                  ) : (
                    <>
                      {r.files.length} file{r.files.length === 1 ? "" : "s"}, {r.changes.length} change
                      {r.changes.length === 1 ? "" : "s"}
                    </>
                  )}
                </Typography>
              </LaneItem>
            ))}
            <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>
              Questions between rounds need powerchannel. Comments go with the round.
            </Typography>
          </>
        )}
      </Box>
      {withBoard && open ? <Compose agent={agent} onPost={onPost} /> : <Box />}
      {footer ?? <RoundBox session={session} round={round} counts={counts} actions={actions} busy={busy} />}
    </Box>
  )
}

function Compose({ agent, onPost }: { agent: string; onPost: (text: string) => Promise<void> }) {
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  // The field grows with its text up to its max height (WebKitGTK has no field-sizing).
  const field = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [text])
  const send = () => {
    const value = text.trim()
    if (!value) return
    setError(null)
    onPost(value).then(
      () => setText(""),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
  }
  return (
    <Box sx={{ px: 1.5, pt: 0.75, pb: 1.25 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-end",
          gap: 0.5,
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
          bgcolor: "background.paper",
          pl: 1.25,
          pr: 0.5,
          py: 0.5,
          "&:focus-within": { borderColor: "primary.main", boxShadow: "0 0 0 3px var(--pg-review-ok-bg)" },
        }}
      >
        <Box
          component="textarea"
          ref={field}
          data-testid="board-say"
          rows={1}
          value={text}
          aria-label={`Message ${agent}`}
          placeholder={`Message ${agent}`}
          title="Enter sends, Shift+Enter is a new line"
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
              e.preventDefault()
              send()
            }
          }}
          sx={{
            flex: 1,
            minWidth: 0,
            border: 0,
            outline: 0,
            resize: "none",
            bgcolor: "transparent",
            color: "text.primary",
            fontFamily: "inherit",
            fontSize: 13,
            lineHeight: "20px",
            py: "4px",
            overflowY: "auto",
            maxHeight: 140,
          }}
        />
        <IconButton
          size="small"
          data-testid="board-post-button"
          aria-label="Post"
          title="Post"
          disabled={!text.trim()}
          onClick={send}
          sx={{
            width: 28,
            height: 28,
            bgcolor: text.trim() ? "primary.main" : "transparent",
            color: text.trim() ? "primary.contrastText" : "text.disabled",
            "&:hover": { bgcolor: text.trim() ? "primary.dark" : "transparent" },
            "& svg": { fontSize: 16 },
          }}
        >
          <ArrowUpwardIcon />
        </IconButton>
      </Box>
      {error && <Typography sx={{ fontSize: 12, color: "error.main", mt: 0.5 }}>{error}</Typography>}
    </Box>
  )
}

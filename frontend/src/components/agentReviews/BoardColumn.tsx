import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useEffect, useRef, useState } from "react"
import type { AgentReview, AgentReviewRound, BoardMessage } from "../../engine"
import type { BoardState } from "../../hooks/useAgentReviewBoard"
import { RoundBox, type RoundActions } from "./RoundBox"
import { clock, commentRef, presenceLabel, type RoundCounts } from "./roundModel"

// The right column of the review (v0.21.3, layout A of
// docs/prototypes/agent-review-v3.html): the review's powerboard channel —
// the feed, the agent's presence, a box that posts at once — and under it the
// round box (the counts, a note, Send round n / Approve all / Cancel). With no
// powerboard the column is the list of rounds and the agent waits in
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
}: {
  session: AgentReview
  round: AgentReviewRound
  counts: RoundCounts
  board: BoardState
  onPost: (text: string) => Promise<void>
  onJump: (commentId: string) => void
  actions: RoundActions
  busy: boolean
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
  return (
    <Box
      data-testid="board-column"
      data-board={withBoard ? "on" : "off"}
      sx={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto auto", minHeight: 0, height: "100%" }}
    >
      <Box sx={{ px: 1.25, py: 1, borderBottom: 1, borderColor: "divider" }}>
        {withBoard ? (
          <>
            <Box sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
              <Typography sx={{ fontWeight: 600, fontSize: 13 }}>Board</Typography>
              <Typography
                data-testid="board-channel"
                noWrap
                sx={{ fontFamily: "var(--pg-font-mono, monospace)", fontSize: 12, flex: 1, minWidth: 0 }}
              >
                {session.board}
              </Typography>
              <Typography sx={{ fontSize: 11, color: "text.secondary" }}>powerboard</Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", mt: 0.25 }}>
              <Box
                component="span"
                data-testid="board-presence"
                data-reading={board.reading ? "yes" : "no"}
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  flexShrink: 0,
                  bgcolor: board.reading ? "var(--pg-review-accept)" : "text.disabled",
                }}
              />
              <Typography noWrap sx={{ fontSize: 12, color: "text.secondary" }}>
                {open
                  ? `${board.agent ?? session.agent ?? "The agent"} ${presenceLabel(board.lastRead, board.reading, now)}`
                  : "review closed"}
              </Typography>
            </Box>
          </>
        ) : (
          <>
            <Typography sx={{ fontWeight: 600, fontSize: 13 }}>Rounds</Typography>
            <Typography data-testid="board-unavailable" sx={{ fontSize: 12, color: "text.secondary" }}>
              {session.board ? (board.reason ?? "powerboard not available") : "powerboard not found"}
              {session.mode === "wait" ? " · the agent waits in agent_review_wait" : ""}
            </Typography>
          </>
        )}
      </Box>
      <Box
        ref={feed}
        data-testid="board-feed"
        sx={{ overflow: "auto", px: 1.25, py: 1, display: "flex", flexDirection: "column", gap: 1 }}
      >
        {withBoard
          ? board.messages.map((m) => <Post key={m.id} message={m} agent={session.agent} onJump={onJump} />)
          : (session.rounds ?? []).map((r) => (
              <Box
                key={r.n}
                sx={{
                  bgcolor: "action.hover",
                  borderRadius: 1.5,
                  px: 1,
                  py: 0.75,
                  fontSize: 12,
                  color: "text.secondary",
                }}
              >
                Round {r.n} opened · {r.files.length} file{r.files.length === 1 ? "" : "s"}, {r.changes.length} change
                {r.changes.length === 1 ? "" : "s"}
                {r.sentAt ? " · sent" : ""}
              </Box>
            ))}
        {!withBoard && (
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            Questions between rounds need powerboard. Comments go with the round.
          </Typography>
        )}
      </Box>
      {withBoard && open ? <Compose agent={session.agent} channel={session.board!} onPost={onPost} /> : <Box />}
      <RoundBox session={session} round={round} counts={counts} actions={actions} busy={busy} />
    </Box>
  )
}

function Post({
  message,
  agent,
  onJump,
}: {
  message: BoardMessage
  agent: string | null
  onJump: (id: string) => void
}) {
  if (message.author === "powergit")
    return (
      <Box
        data-testid="board-post"
        data-author="powergit"
        sx={{
          bgcolor: "action.hover",
          borderRadius: 1.5,
          px: 1,
          py: 0.75,
          fontSize: 12,
          color: "text.secondary",
          whiteSpace: "pre-wrap",
        }}
      >
        <Box component="span" sx={{ fontFamily: "var(--pg-font-mono, monospace)" }}>
          {clock(message.at)}
        </Box>{" "}
        ·{" "}
        {message.text
          .split("\n")
          .filter((l) => !l.startsWith("review_id="))
          .join(" — ")}
      </Box>
    )
  const human = message.author === "human"
  const ref = commentRef(message.text)
  const [first, ...rest] = message.text.split("\n")
  const block = rest.filter((l) => /^[✗~?✓] |^ {2}|^details: /.test(l))
  const text = [first, ...rest.filter((l) => !block.includes(l))].join("\n")
  return (
    <Box
      data-testid="board-post"
      data-author={message.author}
      sx={{
        border: 1,
        borderColor: "divider",
        borderLeft: 3,
        borderLeftColor: human ? "primary.main" : "var(--pg-agent)",
        borderRadius: 1.5,
        px: 1,
        py: 0.75,
      }}
    >
      <Box sx={{ display: "flex", gap: 0.75, alignItems: "baseline" }}>
        <Typography sx={{ fontWeight: 600, fontSize: 12, color: human ? "text.primary" : "var(--pg-agent)" }}>
          {human ? "You" : message.author}
        </Typography>
        <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
          {human ? "human · " : message.author !== agent ? "on the channel · " : ""}
          {clock(message.at)}
        </Typography>
        {ref && (
          <Box
            component="button"
            data-testid="board-ref"
            onClick={() => onJump(ref)}
            sx={{
              border: 0,
              bgcolor: "transparent",
              color: "primary.main",
              cursor: "pointer",
              fontFamily: "var(--pg-font-mono, monospace)",
              fontSize: 11,
              p: 0,
            }}
          >
            {ref} ↗
          </Box>
        )}
      </Box>
      <Typography sx={{ fontSize: 13, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{text}</Typography>
      {block.length > 0 && (
        <Box
          component="pre"
          sx={{
            m: 0,
            mt: 0.5,
            p: 0.75,
            bgcolor: "action.hover",
            borderRadius: 1,
            fontFamily: "var(--pg-font-mono, monospace)",
            fontSize: 11,
            lineHeight: "1.5",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {block.join("\n")}
        </Box>
      )}
    </Box>
  )
}

function Compose({
  agent,
  channel,
  onPost,
}: {
  agent: string | null
  channel: string
  onPost: (text: string) => Promise<void>
}) {
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
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
    <Box sx={{ borderTop: 1, borderColor: "divider", px: 1.25, py: 1, display: "grid", gap: 0.75 }}>
      <Box
        component="textarea"
        data-testid="board-say"
        value={text}
        placeholder={`Message ${agent ?? "the agent"} on ${channel}`}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
            e.preventDefault()
            send()
          }
        }}
        sx={{
          width: "100%",
          minHeight: 44,
          fontFamily: "inherit",
          fontSize: 13,
          color: "text.primary",
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          p: 0.75,
          resize: "vertical",
        }}
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography sx={{ fontSize: 12, color: error ? "error.main" : "text.secondary", flex: 1 }}>
          {error ?? "Posts now. Enter sends, Shift+Enter is a new line."}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          data-testid="board-post-button"
          onClick={send}
          sx={{ textTransform: "none", py: 0 }}
        >
          Post
        </Button>
      </Box>
    </Box>
  )
}

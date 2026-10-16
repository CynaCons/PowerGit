import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import type { AgentReviewThread } from "../../engine"
import { Markdown } from "../Markdown"
import { Chip } from "./reviewChips"

// A comment thread under a line of the agent review diff (v0.21.3): the
// owner's comment, its id once the engine gave it one, whether it went out at
// once (Ask now) or with the round, and the agent's replies; and the draft box.

export type CommentKind = "round" | "ask"

export function Thread({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <Box
      data-testid="round-thread"
      sx={{
        m: "4px 8px 8px 46px",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        bgcolor: "action.hover",
        whiteSpace: "normal",
      }}
    >
      {title && <Typography sx={{ fontSize: 11, color: "text.secondary", px: 1.25, pt: 0.5 }}>{title}</Typography>}
      {children}
    </Box>
  )
}

export function ThreadItems({
  thread,
  text,
  kind,
  line,
}: {
  thread: AgentReviewThread | null
  text: string
  kind: CommentKind
  line: string
}) {
  return (
    <>
      <Box sx={{ px: 1.25, py: 0.75, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Typography sx={{ fontWeight: 600, fontSize: 12 }}>You</Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            {thread ? `${thread.id} · ` : ""}line {line.slice(1)}
          </Typography>
          {kind === "ask" ? (
            <Chip tone="info">asked on the board</Chip>
          ) : thread ? (
            <Chip tone="muted">sent with round {thread.round}</Chip>
          ) : (
            <Chip tone="wait">goes with the round</Chip>
          )}
        </Box>
        <Box data-testid="thread-body">
          <Markdown text={text} />
        </Box>
      </Box>
      {thread?.replies.map((r, i) => (
        <Box key={i} data-testid="thread-reply" sx={{ px: 1.25, py: 0.75, borderTop: 1, borderColor: "divider" }}>
          <Typography sx={{ fontWeight: 600, fontSize: 12, color: "var(--pg-agent)" }}>{r.author}</Typography>
          <Markdown text={r.body} />
        </Box>
      ))}
    </>
  )
}

export function Draft({
  canAsk,
  line,
  onCancel,
  onSave,
}: {
  canAsk: boolean
  line: string
  onCancel: () => void
  onSave: (text: string, kind: CommentKind) => void
}) {
  const [text, setText] = useState("")
  const save = (kind: CommentKind) => text.trim() && onSave(text.trim(), kind)
  return (
    <Box sx={{ px: 1.25, py: 0.75, borderTop: 1, borderColor: "divider" }}>
      <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>Comment on line {line.slice(1)}</Typography>
      <Box
        component="textarea"
        data-testid="comment-draft"
        autoFocus
        value={text}
        placeholder="Comment to the agent"
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Escape") onCancel()
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save("round")
        }}
        sx={{
          width: "100%",
          minHeight: 52,
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
      <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", mt: 0.5, flexWrap: "wrap" }}>
        <Button
          size="small"
          variant="contained"
          data-testid="comment-add"
          onClick={() => save("round")}
          sx={{ textTransform: "none", py: 0 }}
        >
          Add to round
        </Button>
        {canAsk && (
          <Button
            size="small"
            variant="outlined"
            data-testid="comment-ask"
            onClick={() => save("ask")}
            sx={{ textTransform: "none", py: 0 }}
          >
            Ask now
          </Button>
        )}
        <Button size="small" onClick={onCancel} sx={{ textTransform: "none", py: 0 }}>
          Cancel
        </Button>
        {canAsk && (
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Ask now posts it on the board at once.</Typography>
        )}
      </Box>
    </Box>
  )
}

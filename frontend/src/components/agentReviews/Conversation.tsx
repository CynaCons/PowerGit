import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import type { AgentReviewThread } from "../../engine"
import { Markdown } from "../Markdown"
import { AgentDisc, LaneItem, OwnerDisc } from "./boardLane"
import { Chip } from "./reviewChips"
import { clock } from "./roundModel"
import { fieldSx } from "./fieldSx"
import { EditBox, type CommentKind, type ThreadActions } from "./RoundThread"

// One comment's conversation under a line of the agent review diff (v0.21.3;
// v0.21.13, owner: "when the agent answers, it should be displayed in a
// conversation, like in Bitbucket"). The owner's comment opens it, every
// reply follows in time order on the same lane as the board (a disc, the
// author, the time, the text as Markdown), and a Reply box ends it. A
// conversation from an earlier round says which round and line it was on and
// quotes that line, since the line may read differently now.

export type Quote = { kind: "add" | "remove" | "context"; text: string }

const actionSx = {
  border: 0,
  bgcolor: "transparent",
  color: "text.secondary",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
  px: 0.5,
  py: 0,
  borderRadius: 0.5,
  "&:hover": { color: "text.primary", bgcolor: "action.hover" },
  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" },
} as const
const dangerSx = { ...actionSx, "&:hover": { color: "error.main", bgcolor: "action.hover" } } as const
const nameSx = { fontWeight: 600, fontSize: 12.5, lineHeight: "22px" } as const
const timeSx = { fontSize: 11, color: "text.secondary", ml: "auto", fontVariantNumeric: "tabular-nums" } as const

function QuoteLine({ quote }: { quote: Quote }) {
  const sign = quote.kind === "add" ? "+" : quote.kind === "remove" ? "-" : " "
  return (
    <Box
      data-testid="thread-quote"
      sx={{
        fontFamily: "var(--pg-font-mono, monospace)",
        fontSize: 12,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        px: 0.75,
        py: 0.25,
        my: 0.5,
        borderRadius: 1,
        color: quote.kind === "add" ? "var(--pg-diff-added)" : quote.kind === "remove" ? "var(--pg-diff-removed)" : "text.secondary",
        bgcolor:
          quote.kind === "add"
            ? "var(--pg-diff-added-bg, rgba(24,145,0,.1))"
            : quote.kind === "remove"
              ? "var(--pg-diff-removed-bg, rgba(211,0,11,.08))"
              : "action.hover",
      }}
    >
      {sign}
      {quote.text}
    </Box>
  )
}

function ReplyBox({ onSend, off }: { onSend: ((body: string) => void) | null; off: string | null }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  if (!onSend)
    return off ? <Typography sx={{ fontSize: 11.5, color: "text.secondary", pl: "28px", pb: 0.5 }}>{off}</Typography> : null
  const send = () => {
    if (!text.trim()) return
    onSend(text.trim())
    setText("")
    setOpen(false)
  }
  if (!open)
    return (
      <Box sx={{ pl: "28px", pb: 0.25 }}>
        <Box component="button" data-testid="thread-reply-open" onClick={() => setOpen(true)} sx={actionSx}>
          Reply
        </Box>
      </Box>
    )
  return (
    <Box sx={{ pl: "28px", pb: 0.5 }}>
      <Box
        component="textarea"
        data-testid="thread-reply-text"
        autoFocus
        value={text}
        placeholder="Reply on the board"
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Escape") setOpen(false)
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send()
        }}
        sx={{ ...fieldSx, minHeight: 48 }}
      />
      <Box sx={{ display: "flex", gap: 0.75, mt: 0.5, alignItems: "center" }}>
        <Button
          size="small"
          variant="contained"
          data-testid="thread-reply-send"
          disabled={!text.trim()}
          onClick={send}
          sx={{ textTransform: "none", py: 0 }}
        >
          Reply
        </Button>
        <Button size="small" onClick={() => setOpen(false)} sx={{ textTransform: "none", py: 0 }}>
          Cancel
        </Button>
        <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>Ctrl+Enter sends</Typography>
      </Box>
    </Box>
  )
}

export function Conversation({
  thread,
  text,
  kind,
  line,
  label,
  quote,
  actions,
  onReply,
  replyOff,
}: {
  thread: AgentReviewThread | null
  text: string
  kind: CommentKind | "withdrawn"
  line: string
  /** "Round 1, line 3" for a conversation from an earlier round; "line 3" otherwise. */
  label?: string
  quote?: Quote | null
  actions?: ThreadActions | null
  /** Posts a reply; null when replies are off (then replyOff says why, if anything). */
  onReply?: ((body: string) => void) | null
  replyOff?: string | null
}) {
  const [editing, setEditing] = useState(false)
  return (
    <Box sx={{ px: 1.25, pt: 1, pb: 0.75, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
      <Box>
        <LaneItem node={<OwnerDisc />}>
          <Box sx={{ display: "flex", gap: 0.75, alignItems: "baseline", flexWrap: "wrap", minWidth: 0 }}>
            <Typography sx={nameSx}>You</Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {thread ? `${thread.id} · ` : ""}
              {label ?? `line ${line.slice(1)}`}
            </Typography>
            {kind === "ask" ? (
              <Chip tone="info">asked on the board</Chip>
            ) : thread ? (
              <Chip tone="muted">sent with round {thread.round}</Chip>
            ) : (
              <Chip tone="wait">goes with the round</Chip>
            )}
            {actions && !editing ? (
              <Box sx={{ ml: "auto", display: "flex", gap: 0.25 }}>
                {actions.edit && (
                  <Box component="button" data-testid="comment-edit" onClick={() => setEditing(true)} sx={actionSx}>
                    Edit
                  </Box>
                )}
                {actions.remove && (
                  <Box component="button" data-testid="comment-delete" onClick={actions.remove} sx={dangerSx}>
                    Delete
                  </Box>
                )}
                {actions.withdraw && (
                  <Box
                    component="button"
                    data-testid="comment-withdraw"
                    onClick={actions.withdraw}
                    title="Take the question back; the board says it was withdrawn"
                    sx={dangerSx}
                  >
                    Withdraw
                  </Box>
                )}
              </Box>
            ) : (
              thread && <Typography sx={timeSx}>{clock(thread.postedAt)}</Typography>
            )}
          </Box>
          {quote && <QuoteLine quote={quote} />}
          {editing && actions?.edit ? (
            <EditBox
              text={text}
              onCancel={() => setEditing(false)}
              onSave={(value) => {
                actions.edit?.(value)
                setEditing(false)
              }}
            />
          ) : (
            <Box data-testid="thread-body">
              <Markdown text={text} />
            </Box>
          )}
        </LaneItem>
        {thread?.replies.map((r, i) => {
          const owner = r.author === "human"
          return (
            <LaneItem key={i} node={owner ? <OwnerDisc /> : <AgentDisc name={r.author} />}>
              <Box data-testid="thread-reply" data-author={r.author}>
                <Box sx={{ display: "flex", gap: 0.75, alignItems: "baseline" }}>
                  <Typography sx={{ ...nameSx, color: owner ? "text.primary" : "var(--pg-agent)" }}>
                    {owner ? "You" : r.author}
                  </Typography>
                  {r.at && <Typography sx={timeSx}>{clock(r.at)}</Typography>}
                </Box>
                <Markdown text={r.body} />
              </Box>
            </LaneItem>
          )
        })}
      </Box>
      {thread && thread.kind !== "withdrawn" && <ReplyBox onSend={onReply ?? null} off={replyOff ?? null} />}
    </Box>
  )
}

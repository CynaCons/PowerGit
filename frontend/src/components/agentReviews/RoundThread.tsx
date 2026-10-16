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

/** v0.21.12: what the owner can still do with a comment (none once the round is sent). */
export type ThreadActions = {
  edit?: (text: string) => void
  remove?: () => void
  withdraw?: () => void
}

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

export function ThreadItems({
  thread,
  text,
  kind,
  line,
  actions,
}: {
  thread: AgentReviewThread | null
  text: string
  kind: CommentKind | "withdrawn"
  line: string
  actions?: ThreadActions | null
}) {
  const [editing, setEditing] = useState(false)
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
          {actions && !editing && (
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
          )}
        </Box>
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

const fieldSx = {
  width: "100%",
  fontFamily: "inherit",
  fontSize: 13,
  color: "text.primary",
  bgcolor: "background.paper",
  border: 1,
  borderColor: "divider",
  borderRadius: 1,
  p: 0.75,
  resize: "vertical",
} as const

function EditBox({ text, onCancel, onSave }: { text: string; onCancel: () => void; onSave: (text: string) => void }) {
  const [value, setValue] = useState(text)
  const save = () => value.trim() && onSave(value.trim())
  return (
    <Box sx={{ mt: 0.5 }}>
      <Box
        component="textarea"
        data-testid="comment-edit-text"
        autoFocus
        value={value}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Escape") onCancel()
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save()
        }}
        sx={{ ...fieldSx, minHeight: 52 }}
      />
      <Box sx={{ display: "flex", gap: 0.75, mt: 0.5 }}>
        <Button
          size="small"
          variant="contained"
          data-testid="comment-edit-save"
          onClick={save}
          sx={{ textTransform: "none", py: 0 }}
        >
          Save
        </Button>
        <Button size="small" onClick={onCancel} sx={{ textTransform: "none", py: 0 }}>
          Cancel
        </Button>
      </Box>
    </Box>
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
        sx={{ ...fieldSx, minHeight: 52 }}
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

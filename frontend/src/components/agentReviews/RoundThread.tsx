import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import { fieldSx } from "./fieldSx"

// The frame of the comments under a line of the agent review diff (v0.21.3),
// the draft box and the edit box. Each comment inside is a Conversation
// (Conversation.tsx, v0.21.13).

export type CommentKind = "round" | "ask"

export function Thread({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <Box
      data-testid="round-thread"
      // --pg-board-bg rings the conversation's discs (boardLane.tsx) in the frame's colour.
      sx={(t) => ({
        "--pg-board-bg": t.palette.background.paper,
        m: "4px 8px 8px 46px",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        bgcolor: "background.paper",
        whiteSpace: "normal",
      })}
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
  /** v0.21.14: take a reviewer agent's comment off the round before it is sent. */
  dismiss?: () => void
}

export function EditBox({
  text,
  onCancel,
  onSave,
}: {
  text: string
  onCancel: () => void
  onSave: (text: string) => void
}) {
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

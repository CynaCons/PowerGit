import CloseIcon from "@mui/icons-material/Close"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Typography from "@mui/material/Typography"
import { serializeDoc } from "../review/reviewFile"
import { setReviewFilePane, useReviewDoc, useReviewPersist } from "../review/reviewState"
import { copyToClipboard } from "./clipboard"

export function ReviewFilePane({ reviewKey }: { reviewKey: string }) {
  const doc = useReviewDoc(reviewKey)
  const persist = useReviewPersist(reviewKey)
  const text = doc ? serializeDoc(doc) : "No review yet."
  const saved = persist.error
    ? persist.error
    : persist.saving
      ? "Saving…"
      : persist.savedAt
        ? `Saved ${new Date(persist.savedAt).toLocaleTimeString()}`
        : "Not saved"
  return (
    <Box
      data-testid="review-file-pane"
      sx={{
        width: 360,
        flexShrink: 0,
        overflowY: "auto",
        borderLeft: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, borderBottom: 1, borderColor: "divider" }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Review file</Typography>
        <Typography sx={{ fontFamily: "monospace", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>
          {reviewKey}
        </Typography>
        <Button size="small" onClick={() => void copyToClipboard(text)} sx={{ ml: "auto", textTransform: "none" }}>
          Copy
        </Button>
        <IconButton size="small" aria-label="Close review file" onClick={() => setReviewFilePane(false)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box
        component="pre"
        data-testid="review-file-json"
        sx={{ m: 0, p: 1.5, flex: 1, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre" }}
      >
        {text}
      </Box>
      <Typography
        data-testid="review-file-saved"
        sx={{
          p: 1,
          fontSize: 11,
          color: persist.error ? "error.main" : "text.secondary",
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        {saved}
      </Typography>
    </Box>
  )
}

import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import Typography from "@mui/material/Typography"
import { commentCount, type ReviewDoc } from "../review/reviewModel"
import { useReviewPersist } from "../review/reviewState"

// Finish review (v0.19.3, docs/design/review-mode.md §4): the summary of
// the document as saved — lines, rejected, comments, the files touched —
// and where the file is. Sending it to an agent is the MCP major (v0.20);
// until then Export → Copy as Markdown is the hand-off.

export function ReviewSummaryDialog({
  open,
  reviewKey,
  doc,
  onClose,
}: {
  open: boolean
  reviewKey: string
  doc: ReviewDoc | null
  onClose: () => void
}) {
  const persist = useReviewPersist(reviewKey)
  const files = doc ? Object.keys(doc.files) : []
  const rejected = doc
    ? Object.values(doc.files).reduce((n, f) => n + Object.values(f.lines).filter((s) => s === "rejected").length, 0)
    : 0
  const comments = commentCount(doc)
  const complete = doc?.status === "complete"
  return (
    <Dialog open={open} onClose={onClose} data-testid="review-summary" maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 15 }}>{complete ? "Review complete" : "Review so far"}</DialogTitle>
      <DialogContent>
        <Typography data-testid="review-summary-lines" sx={{ fontSize: 13 }}>
          {doc?.reviewed ?? 0} / {doc?.changed ?? 0} lines reviewed · {rejected} rejected · {comments}{" "}
          {comments === 1 ? "comment" : "comments"}
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>
          {files.length === 0
            ? "No file touched yet."
            : `${files.length} ${files.length === 1 ? "file" : "files"}: ${files.join(", ")}`}
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1, fontFamily: "monospace" }}>
          .powergit/reviews/{reviewKey}.json
          {persist.saving ? " · saving…" : persist.error ? ` · ${persist.error}` : ""}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose} data-testid="review-summary-close">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

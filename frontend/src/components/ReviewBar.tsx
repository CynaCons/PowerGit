import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import { progressOf, type RowKeys } from "../hooks/useDiffReview"
import { reviewMarkdown, serializeDoc } from "../review/reviewFile"
import { commentCount } from "../review/reviewModel"
import { setReviewFilePane, useReviewDoc, useReviewFilePane, useReviewMode } from "../review/reviewState"
import { isTauriShell } from "../shell"
import { ConfirmDialog } from "./dialogs/ConfirmDialog"
import { copyToClipboard } from "./clipboard"
import { ReviewExportMenu } from "./ReviewExportMenu"
import { ReviewSummaryDialog } from "./ReviewSummaryDialog"

// The review bar (v0.17.0, docs/design/review-mode.md §4, the prototype's
// `.review-bar`): "Reviewing" / "Review complete", a 160 px meter and the
// counts for the file on screen. v0.18.2 dropped the pill background and
// the capitals: the label sits beside the tabs in its own colour, no box.
// v0.19.0 adds Export at the left (owner: "left of the REVIEWING banner we
// need something to export the review"), the Review file pane toggle and
// Start over; v0.19.3 the comment count. Whole-review counts and the file
// pills come with v0.19.2. Renders nothing while review mode is off or the
// row's key is not known yet.

/**
 * Save as… (the pattern of hooks/useOperationActions.ts `saveTextFile`):
 * the shell's save dialog and its `write_text_file` command; in a browser
 * a download, so the e2e harness and the demo have a path too.
 */
async function saveText(name: string, text: string, extension: "md" | "json") {
  if (isTauriShell()) {
    const { save } = await import("@tauri-apps/plugin-dialog")
    const path = await save({
      defaultPath: name,
      filters: [{ name: extension === "md" ? "Markdown" : "JSON", extensions: [extension] }],
    })
    if (!path) return
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("write_text_file", { path, contents: text })
    return
  }
  const url = URL.createObjectURL(new Blob([text]))
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export function ReviewBar({
  reviewKey,
  path,
  rowKeys,
  startOver,
  finish,
  exportDiffs,
}: {
  reviewKey: string | null
  path: string | null
  rowKeys: RowKeys
  startOver: () => Promise<void>
  /** Finish review: the pending save is written before the summary opens. */
  finish: () => Promise<void>
  exportDiffs: () => Promise<Map<string, string>>
}) {
  const mode = useReviewMode()
  const doc = useReviewDoc(reviewKey)
  const pane = useReviewFilePane()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [summary, setSummary] = useState(false)
  if (!mode || reviewKey === null) return null
  const { reviewed, changed, rejected } = progressOf(doc, path, rowKeys)
  const complete = changed > 0 && reviewed >= changed
  const percent = changed > 0 ? (100 * Math.min(reviewed, changed)) / changed : 0
  const comments = commentCount(doc)
  const marked = Boolean(doc && (doc.reviewed > 0 || comments > 0))
  const json = () => (doc ? serializeDoc(doc) : "")
  const markdown = async () => (doc ? reviewMarkdown(doc, await exportDiffs()) : "")
  return (
    <Box
      data-testid="diff-review-bar"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        flexShrink: 0,
        ml: "auto",
        mr: 1,
        py: 0.5,
        color: "text.primary",
      }}
    >
      <Button
        data-testid="review-export"
        size="small"
        variant="outlined"
        disabled={!marked}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ textTransform: "none", fontSize: 12, fontWeight: 600 }}
      >
        Export
      </Button>
      <Typography
        data-testid="diff-review-label"
        component="span"
        sx={{
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1.4,
          color: complete ? "var(--pg-review-ok, #1553c9)" : "var(--pg-review-todo, #b7791f)",
        }}
      >
        {complete ? "Review complete" : "Reviewing"}
      </Typography>
      <Box
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={changed}
        aria-valuenow={Math.min(reviewed, changed)}
        sx={{ position: "relative", width: 160, height: 6, borderRadius: 3, bgcolor: "divider", overflow: "hidden" }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: "0 auto 0 0",
            width: `${percent}%`,
            bgcolor: "var(--pg-review-ok, #1553c9)",
            transition: "width 160ms ease",
            "@media (prefers-reduced-motion: reduce)": { transition: "none" },
          }}
        />
      </Box>
      <Typography data-testid="diff-review-count" component="span" sx={{ fontSize: 12, color: "text.secondary" }}>
        {reviewed} / {changed} lines
        {rejected > 0 && (
          <>
            {" · "}
            <Box component="span" sx={{ color: "var(--pg-review-rejected, #d3000b)", fontWeight: 600 }}>
              {rejected} rejected
            </Box>
          </>
        )}
        {comments > 0 && (
          <>
            {" · "}
            {comments} {comments === 1 ? "comment" : "comments"}
          </>
        )}
      </Typography>
      <Button
        data-testid="review-file-toggle"
        size="small"
        onClick={() => setReviewFilePane(!pane)}
        sx={{ textTransform: "none" }}
      >
        Review file
      </Button>
      <Button
        data-testid="review-start-over"
        size="small"
        disabled={!doc}
        onClick={() => setConfirm(true)}
        sx={{ textTransform: "none" }}
      >
        Start over
      </Button>
      <Button
        data-testid="review-finish"
        size="small"
        variant="contained"
        disableElevation
        disabled={!marked}
        onClick={() => {
          void finish()
          setSummary(true)
        }}
        sx={{ textTransform: "none", fontSize: 12, fontWeight: 600 }}
      >
        Finish review
      </Button>
      <ReviewSummaryDialog open={summary} reviewKey={reviewKey} doc={doc} onClose={() => setSummary(false)} />
      <ReviewExportMenu
        anchor={anchor}
        onClose={() => setAnchor(null)}
        onMarkdown={() => void markdown().then(copyToClipboard)}
        onJson={() => void copyToClipboard(json())}
        onShow={() => setReviewFilePane(true)}
        onSaveMarkdown={() => void markdown().then((text) => saveText(`review-${reviewKey}.md`, text, "md"))}
        onSaveJson={() => void saveText(`review-${reviewKey}.json`, json(), "json")}
      />
      <ConfirmDialog
        open={confirm}
        testid="review-start-over-confirm"
        title="Start the review over?"
        text="The marks and comments are dropped and the review file is deleted."
        confirmLabel="Start over"
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false)
          void startOver()
        }}
      />
    </Box>
  )
}

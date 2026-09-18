import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import { progressOf, type RowKeys } from "../hooks/useDiffReview"
import { reviewMarkdown, serializeDoc } from "../review/reviewFile"
import { setReviewFilePane, useReviewDoc, useReviewFilePane, useReviewMode } from "../review/reviewState"
import { isTauriShell } from "../shell"
import { ConfirmDialog } from "./dialogs/ConfirmDialog"
import { copyToClipboard } from "./clipboard"
import { ReviewExportMenu } from "./ReviewExportMenu"

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
  exportDiffs,
}: {
  reviewKey: string | null
  path: string | null
  rowKeys: RowKeys
  startOver: () => Promise<void>
  exportDiffs: () => Promise<Map<string, string>>
}) {
  const mode = useReviewMode()
  const doc = useReviewDoc(reviewKey)
  const pane = useReviewFilePane()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [confirm, setConfirm] = useState(false)
  if (!mode || reviewKey === null) return null
  const { reviewed, changed, rejected } = progressOf(doc, path, rowKeys)
  const complete = changed > 0 && reviewed >= changed
  const percent = changed > 0 ? (100 * Math.min(reviewed, changed)) / changed : 0
  const marked = Boolean(doc && (doc.reviewed > 0 || Object.values(doc.files).some((f) => f.comments.length > 0)))
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

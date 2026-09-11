import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import { progressOf, type RowKeys } from "../hooks/useDiffReview"
import { useReviewDoc, useReviewMode } from "../review/reviewState"

// The review bar (v0.17.0, docs/design/review-mode.md §4, the prototype's
// `.review-bar`): REVIEWING / REVIEW COMPLETE, a 160 px meter and the
// counts for the file on screen. Whole-review counts, the file pills and
// the Review file / Start over / Finish review buttons come with v0.17.1
// and v0.17.3. Renders nothing while review mode is off or the row's key
// is not known yet.

export function ReviewBar({
  reviewKey,
  path,
  rowKeys,
}: {
  reviewKey: string | null
  path: string | null
  rowKeys: RowKeys
}) {
  const mode = useReviewMode()
  const doc = useReviewDoc(reviewKey)
  if (!mode || reviewKey === null) return null
  const { reviewed, changed, rejected } = progressOf(doc, path, rowKeys)
  const complete = changed > 0 && reviewed >= changed
  const percent = changed > 0 ? (100 * Math.min(reviewed, changed)) / changed : 0
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
        px: 1.25,
        py: 0.5,
        borderRadius: 1,
        bgcolor: "var(--pg-review-todo-bg, #fdf3e0)",
        color: "text.primary",
      }}
    >
      <Typography
        data-testid="diff-review-label"
        component="span"
        sx={{
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          lineHeight: 1.4,
          color: complete ? "var(--pg-review-ok, #1553c9)" : "var(--pg-review-todo, #b7791f)",
        }}
      >
        {complete ? "REVIEW COMPLETE" : "REVIEWING"}
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
    </Box>
  )
}

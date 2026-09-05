import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import { useEffect, useMemo, useState } from "react"
import type { DiffDto } from "../engine"
import { highlightToHtml, languageForPath } from "../highlight"
import { codeSx, MONO_FONT } from "../theme"
import { ContentNotice } from "./ContentNotice"
import { LoadingState } from "./AsyncState"
import { VirtualLines } from "./VirtualLines"

// Shared by both the plain-text and Shiki-highlighted render paths so
// toggling between them (highlighting resolves after the plain text is
// already showing) never changes font size, line height, or scrolling.
const BLOB_PANE_SX = {
  m: 0,
  p: 2,
  flex: 1,
  minWidth: 0,
  overflow: "auto",
  ...codeSx,
  fontSize: 12,
  lineHeight: "18px",
  bgcolor: "background.paper",
  whiteSpace: "pre",
} as const

// Shiki's HTML nests its own <pre><code>. Force both onto our mono stack
// with ligatures off (Shiki sets its own font-family on the <pre> in some
// configurations, and the "->" ligature the owner rejected must stay off
// regardless) with !important, since that's an inline style Shiki may set.
// `color` is deliberately never touched here — that inline style *is* the
// per-token highlighting produced by Shiki.
const BLOB_PANE_HTML_SX = {
  ...BLOB_PANE_SX,
  "& pre": {
    margin: 0,
    fontFamily: `${MONO_FONT} !important`,
    fontSize: "inherit",
    lineHeight: "inherit",
    fontVariantLigatures: "none !important",
    fontFeatureSettings: '\'"liga" 0, "calt" 0\' !important',
  },
  "& code": {
    fontFamily: `${MONO_FONT} !important`,
    fontVariantLigatures: "none !important",
    fontFeatureSettings: '\'"liga" 0, "calt" 0\' !important',
  },
} as const

/** Above this many characters Shiki is skipped and the plain virtualized
 *  path is used: tokenizing a multi-megabyte file blocks the UI thread and
 *  its HTML would be a million-element tree. */
export const HIGHLIGHT_MAX_CHARS = 200_000

/** Files up to this many lines render as one plain <pre> (exact text, whole-
 *  file selection/copy); longer ones are virtualized. */
export const VIRTUALIZE_MIN_LINES = 2_000

export function BlobPane({
  blob,
  path,
  onOpenDifftool,
  onRetry,
}: {
  blob: DiffDto | null
  path: string | null
  onOpenDifftool?: () => void
  onRetry?: () => void
}) {
  const [html, setHtml] = useState<string | null>(null)
  // The effect keys on the text, not the DTO: a refetch that yields the same
  // bytes must not re-run the highlighter.
  const text = blob?.text ?? null
  const highlightable = text !== null && text.length <= HIGHLIGHT_MAX_CHARS && !blob?.binary

  useEffect(() => {
    // Reset synchronously (not just on failure) so a fast file switch never
    // paints a stale highlight: the plain-text branch below is always
    // correct in the interim, until (and unless) this file's own highlight
    // resolves.
    setHtml(null)
    if (text === null || !highlightable) return
    const lang = path ? languageForPath(path) : null
    if (!lang) return
    let cancelled = false
    highlightToHtml(text, lang).then((result) => {
      if (!cancelled) setHtml(result)
    })
    return () => {
      cancelled = true
    }
  }, [text, path, highlightable])

  const lines = useMemo(() => (text === null ? [] : text.split("\n")), [text])

  return (
    <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 1.5, py: 0.5, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="caption" sx={{ fontFamily: MONO_FONT }}>
          {path ?? "Select a file in the tree."}
        </Typography>
      </Box>
      {blob && <ContentNotice dto={blob} onOpenDifftool={onOpenDifftool} onRetry={onRetry} />}
      {html ? (
        <Box
          data-testid="blob-pane"
          sx={BLOB_PANE_HTML_SX}
          // Safe: this is Shiki's own HTML, produced by tokenizing
          // `blob.text` against a TextMate grammar — Shiki escapes the text
          // itself, so nothing here interpolates raw file text into HTML.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : blob && lines.length <= VIRTUALIZE_MIN_LINES ? (
        <Box data-testid="blob-pane" component="pre" sx={BLOB_PANE_SX}>
          {blob.text}
        </Box>
      ) : blob ? (
        <Box data-testid="blob-pane" sx={{ ...BLOB_PANE_SX, p: 0, display: "flex", flexDirection: "column" }}>
          <VirtualLines
            count={lines.length}
            ariaLabel={path ? `Contents of ${path}` : "File contents"}
            testid="blob-lines"
            sx={{ padding: "16px" }}
            renderLine={(i) => <span>{lines[i] || " "}</span>}
          />
        </Box>
      ) : path ? (
        <LoadingState label="Loading file…" testid="blob-loading" />
      ) : (
        <Box data-testid="blob-pane" component="pre" sx={BLOB_PANE_SX} />
      )}
    </Box>
  )
}

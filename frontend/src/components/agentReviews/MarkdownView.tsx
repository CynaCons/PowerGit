import Box from "@mui/material/Box"
import ToggleButton from "@mui/material/ToggleButton"
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup"
import Typography from "@mui/material/Typography"
import { useMemo } from "react"
import type { AgentReviewRound } from "../../engine"
import { Markdown } from "../Markdown"
import { previewOf } from "./markdownPreview"
import { hunksOf } from "./roundModel"

// v0.22.6: the switch over a Markdown file of a review (Changes | Preview),
// and the rendered file.

export function MarkdownSwitch({ preview, onPreview }: { preview: boolean; onPreview: (preview: boolean) => void }) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={preview ? "preview" : "changes"}
      onChange={(_, v: string | null) => v && onPreview(v === "preview")}
      sx={{
        alignSelf: "flex-end",
        mb: 1,
        "& .MuiToggleButton-root": { py: 0.25, px: 1.25, fontSize: 12, textTransform: "none" },
      }}
    >
      <ToggleButton value="changes" data-testid="md-view-changes">
        Changes
      </ToggleButton>
      <ToggleButton value="preview" data-testid="md-view-preview">
        Preview
      </ToggleButton>
    </ToggleButtonGroup>
  )
}

export function MarkdownPreview({
  round,
  path,
  sourceText,
  settled,
}: {
  round: AgentReviewRound
  path: string
  sourceText: string | null
  /** The file was read (or could not be): only then may the partial note show. */
  settled: boolean
}) {
  const file = round.files.find((f) => f.path === path)
  const { text, whole } = useMemo(() => {
    const hunks = hunksOf(
      file?.patch ?? null,
      round.changes.filter((c) => c.path === path),
    )
    return previewOf(sourceText, hunks, file?.status === "A")
  }, [file, round.changes, path, sourceText])
  return (
    <Box
      data-testid="md-preview"
      sx={{
        maxWidth: 860,
        px: 1,
        "& [data-testid=markdown]": { fontSize: 14, lineHeight: 1.6 },
        "& [data-testid=markdown] h1": { fontSize: 24, pb: 0.5, borderBottom: 1, borderColor: "divider" },
        "& [data-testid=markdown] h2": { fontSize: 19, pb: 0.25, borderBottom: 1, borderColor: "divider" },
        "& [data-testid=markdown] h3": { fontSize: 16 },
        "& [data-testid=markdown] table": { borderCollapse: "collapse", my: 1 },
        "& [data-testid=markdown] th, & [data-testid=markdown] td": {
          border: 1,
          borderColor: "divider",
          px: 1,
          py: 0.25,
        },
      }}
    >
      {!whole && settled && (
        <Typography data-testid="md-preview-partial" sx={{ fontSize: 12, color: "text.secondary", mb: 1 }}>
          Only the changed parts: the whole file could not be read.
        </Typography>
      )}
      <Markdown text={text} />
    </Box>
  )
}

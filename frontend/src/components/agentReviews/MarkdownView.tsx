import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import ToggleButton from "@mui/material/ToggleButton"
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup"
import Typography from "@mui/material/Typography"
import { useMemo } from "react"
import { Markdown } from "../Markdown"
import { LineThreadsBody } from "./LineThreads"
import { blocksOf, previewOf, type PreviewBlock } from "./markdownPreview"
import type { RoundDiffProps } from "./RoundDiff"
import { hunksOf } from "./roundModel"
import { lineComments } from "./threadActions"

// v0.22.6: the switch over a Markdown file of a review (Changes | Preview),
// and the rendered file. v0.22.7: the file in blocks (markdownPreview.ts),
// each commented on by the button at its left, its comments under it.

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

export function MarkdownPreview(p: RoundDiffProps) {
  const { round, path, sourceText } = p
  const file = round.files.find((f) => f.path === path)
  const { blocks, whole } = useMemo(() => {
    const hunks = hunksOf(
      file?.patch ?? null,
      round.changes.filter((c) => c.path === path),
    )
    const { lines, whole } = previewOf(sourceText, hunks, file?.status === "A")
    return { blocks: blocksOf(lines), whole }
  }, [file, round.changes, path, sourceText])
  return (
    <Box
      data-testid="md-preview"
      sx={{
        maxWidth: 900,
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
      {!whole && p.sourceSettled && (
        <Typography data-testid="md-preview-partial" sx={{ fontSize: 12, color: "text.secondary", mb: 1, ml: 4 }}>
          Only the changed parts: the whole file could not be read.
        </Typography>
      )}
      {blocks.map((b, i) => (
        <Block key={`${b.start ?? "x"}:${i}`} p={p} block={b} />
      ))}
    </Box>
  )
}

/** The comment lines of a block: its own lines that hold a comment, and its first line while it is picked. */
function blockLines(p: RoundDiffProps, block: PreviewBlock): string[] {
  if (block.start === null || block.end === null) return []
  const { start, end } = block
  const inside = (line: string) => {
    const m = /^\+(\d+)$/.exec(line)
    return m !== null && Number(m[1]) >= start && Number(m[1]) <= end
  }
  const lines = new Set<string>()
  for (const c of p.doc?.files[p.path]?.comments ?? []) if (inside(c.line)) lines.add(c.line)
  for (const t of p.threads) if (t.round === p.round.n && t.path === p.path && inside(t.line)) lines.add(t.line)
  if (p.picked?.path === p.path && inside(p.picked.key)) lines.add(p.picked.key)
  return [...lines].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
}

function Block({ p, block }: { p: RoundDiffProps; block: PreviewBlock }) {
  const lines = blockLines(p, block)
  const first = block.start === null ? null : `+${block.start}`
  const picked = first !== null && p.picked?.path === p.path && p.picked.key === first
  return (
    <Box data-testid="md-block" data-line={block.start ?? ""}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "32px minmax(0, 1fr)",
          borderRadius: 1,
          bgcolor: picked ? "var(--pg-agent-bg, rgba(37,99,235,.06))" : "transparent",
          "&:hover": { bgcolor: "action.hover" },
          "&:hover .md-comment, & .md-comment:focus-visible": { opacity: 1 },
        }}
      >
        <Box sx={{ pt: 0.75 }}>
          {p.editable && first !== null && (
            <IconButton
              className="md-comment"
              data-testid="md-comment"
              size="small"
              title={`Comment on line ${block.start}`}
              aria-label={`Comment on line ${block.start}`}
              onClick={() => p.onPick(first)}
              sx={{ opacity: 0, p: 0.25, color: "text.secondary" }}
            >
              <AddCommentOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </Box>
        <Box sx={{ minWidth: 0, pr: 1 }}>
          <Markdown text={block.text} />
        </Box>
      </Box>
      {lines.map((line) => {
        const { comments, loose } = lineComments(p, line)
        return (
          <Box key={line} data-testid="md-threads" data-line={line} sx={{ ml: -3 }}>
            <LineThreadsBody
              p={p}
              line={line}
              comments={comments}
              loose={loose}
              picked={p.picked?.path === p.path && p.picked.key === line}
            />
          </Box>
        )
      })}
    </Box>
  )
}

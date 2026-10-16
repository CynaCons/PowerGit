// The PowerGit post as an event row (v0.21.11): the first line as a one-line
// event, the verdict lines as a compact list in the review's verdict colours
// (RoundDiff.tsx's VERDICT_COLOR mapping: ✗ rejected, ~ mixed, ? undecided,
// ✓ accepted), the indented lines nested under their parent, and the
// "details:" line as a quote.
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import { Markdown } from "../Markdown"
import { parsePowerGitEvent } from "./boardEvents"

const MARK_COLOR: Record<string, string> = {
  "✗": "var(--pg-review-rejected)",
  "~": "var(--pg-review-todo)",
  "?": "divider",
  "✓": "var(--pg-review-accept)",
}

export function PowerGitEventView({ text }: { text: string }) {
  const event = parsePowerGitEvent(text)
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
        {event.event}
      </Typography>
      {event.markdown && <Markdown text={event.markdown} />}
      {event.verdicts.length > 0 && (
        <Box
          component="ul"
          data-testid="board-verdicts"
          sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 0.25 }}
        >
          {event.verdicts.map((v, i) => (
            <Box
              component="li"
              key={i}
              sx={{
                fontFamily: "var(--pg-font-mono, monospace)",
                fontSize: 11,
                lineHeight: 1.5,
                color: MARK_COLOR[v.mark] ?? "text.primary",
              }}
            >
              {v.mark} {v.text}
              {v.children.map((c, j) => (
                <Box
                  key={j}
                  component="span"
                  sx={{ display: "block", pl: "1.5ch", color: "text.secondary" }}
                >
                  {c}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )}
      {event.details !== "" && (
        <Box
          component="blockquote"
          sx={{
            m: 0,
            pl: 0.75,
            borderLeft: 2,
            borderColor: "divider",
            color: "text.secondary",
            fontFamily: "var(--pg-font-mono, monospace)",
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          {event.details}
        </Box>
      )}
    </Box>
  )
}

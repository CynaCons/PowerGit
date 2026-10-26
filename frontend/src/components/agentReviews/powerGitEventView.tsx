// A round event on the board lane (v0.21.11; v0.21.12 lane design): the
// title and its time on one line, the facts under it in small print, the
// round's text (title, the agent's why or note, "cN answered") as Markdown,
// the verdict lines as a compact list in the review's verdict colours
// (RoundDiff.tsx: ✗ rejected, ~ mixed, ? undecided, ✓ accepted) with their
// indented lines nested. The "details:" line is for the agent and stays off.
// v0.22.9: the verdict lines and the event's extra lines are folded behind
// "Show n lines", so the owner's and the agent's own posts stay easy to find.
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useState } from "react"
import { Markdown } from "../Markdown"
import { parsePowerGitEvent } from "./boardEvents"

const MARK_COLOR: Record<string, string> = {
  "✗": "var(--pg-review-rejected)",
  "~": "var(--pg-review-todo)",
  "?": "text.secondary",
  "✓": "var(--pg-review-accept)",
}

export function PowerGitEventView({ text, at }: { text: string; at?: string }) {
  const event = parsePowerGitEvent(text)
  const [open, setOpen] = useState(false)
  const folded = event.verdicts.reduce((n, v) => n + 1 + v.children.length, 0) + event.extra.length
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 12.5,
            fontWeight: 600,
            color: event.kind === "approved" ? "var(--pg-review-accept)" : "text.primary",
          }}
        >
          {event.title}
        </Typography>
        {at && (
          <Typography sx={{ fontSize: 11, color: "text.secondary", ml: "auto", fontVariantNumeric: "tabular-nums" }}>
            {at}
          </Typography>
        )}
      </Box>
      {event.facts && (
        <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: -0.25 }}>{event.facts}</Typography>
      )}
      {event.markdown && (
        <Box sx={{ color: "text.secondary", "& strong": { color: "text.primary" } }}>
          <Markdown text={event.markdown} fold />
        </Box>
      )}
      {folded > 0 && (
        <Button
          size="small"
          data-testid="board-details-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          sx={{ alignSelf: "flex-start", textTransform: "none", fontSize: 12, py: 0, px: 0.5, minWidth: 0 }}
        >
          {open ? "Hide details" : `Show ${folded} line${folded === 1 ? "" : "s"}`}
        </Button>
      )}
      {open && event.extra.length > 0 && (
        <Box
          data-testid="board-extra"
          sx={{
            fontSize: 12,
            lineHeight: 1.5,
            color: "text.secondary",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {event.extra.join("\n")}
        </Box>
      )}
      {open && event.verdicts.length > 0 && (
        <Box
          component="ul"
          data-testid="board-verdicts"
          sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 0.25 }}
        >
          {event.verdicts.map((v, i) => (
            <Box
              component="li"
              key={i}
              sx={{ fontSize: 12, lineHeight: 1.5, display: "grid", gridTemplateColumns: "14px minmax(0, 1fr)" }}
            >
              <Box component="span" sx={{ color: MARK_COLOR[v.mark] ?? "text.primary", fontWeight: 700 }}>
                {v.mark}{" "}
              </Box>
              <Box component="span" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", minWidth: 0 }}>
                {v.text}
                {v.children.map((c, j) => (
                  <Box key={j} component="span" sx={{ display: "block", color: "text.secondary" }}>
                    {c}
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

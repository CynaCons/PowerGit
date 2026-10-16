import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import { Markdown } from "../Markdown"

/** The review's why and the agent's round note under the screen's title
 *  (v0.21.11, owner: "agents should be encouraged to structure their text,
 *  maybe with markdown format"): both are Markdown, folded when long. */
export function ReviewIntro({ why, note, agent }: { why: string | null; note: string | null; agent: string | null }) {
  return (
    <>
      {why && (
        <Box data-testid="agent-review-why" sx={{ mt: 0.25 }}>
          <Markdown text={why} fold />
        </Box>
      )}
      {note && (
        <Box data-testid="agent-review-note" sx={{ mt: 0.25, display: "flex", gap: 0.5, alignItems: "baseline" }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: "var(--pg-agent)", flexShrink: 0 }}>
            {agent ?? "Agent"}:
          </Typography>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Markdown text={note} fold />
          </Box>
        </Box>
      )}
    </>
  )
}

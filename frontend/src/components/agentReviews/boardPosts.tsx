// The board feed's posts (v0.21.11): consecutive posts by the same author
// within five minutes share one header (author or "You", the role text, the
// time, the cN ↗ jump); the bodies go through Markdown, folded so a long
// post clips at ~14 lines behind a "Show more". PowerGit's own posts draw
// as event rows instead of text.
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import type { BoardMessage } from "../../engine"
import { Markdown } from "../Markdown"
import { PowerGitEventView } from "./powerGitEventView"
import { clock, commentRef } from "./roundModel"

const GROUP_WINDOW_MS = 5 * 60 * 1000

function groupPosts(messages: BoardMessage[]): BoardMessage[][] {
  const groups: BoardMessage[][] = []
  for (const m of messages) {
    const last = groups[groups.length - 1]
    const prev = last?.[last.length - 1]
    if (prev && prev.author === m.author && Date.parse(m.at) - Date.parse(prev.at) <= GROUP_WINDOW_MS) {
      last.push(m)
    } else {
      groups.push([m])
    }
  }
  return groups
}

function PostGroup({
  group,
  agent,
  onJump,
}: {
  group: BoardMessage[]
  agent: string | null
  onJump: (id: string) => void
}) {
  const first = group[0]
  const human = first.author === "human"
  const powergit = first.author === "powergit"
  const ref = group.map((m) => commentRef(m.text)).find((r) => r !== null)
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Box sx={{ display: "flex", gap: 0.75, alignItems: "baseline" }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: 12,
            color: human ? "text.primary" : powergit ? "text.secondary" : "var(--pg-agent)",
          }}
        >
          {human ? "You" : first.author}
        </Typography>
        <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
          {human ? "human · " : !powergit && first.author !== agent ? "on the channel · " : ""}
          {clock(first.at)}
        </Typography>
        {ref && (
          <Box
            component="button"
            data-testid="board-ref"
            onClick={() => onJump(ref)}
            sx={{
              border: 0,
              bgcolor: "transparent",
              color: "primary.main",
              cursor: "pointer",
              fontFamily: "var(--pg-font-mono, monospace)",
              fontSize: 11,
              p: 0,
            }}
          >
            {ref} ↗
          </Box>
        )}
      </Box>
      {group.map((m) =>
        powergit ? (
          <Box
            key={m.id}
            data-testid="board-post"
            data-author="powergit"
            sx={{
              bgcolor: "action.hover",
              borderRadius: 1.5,
              px: 1,
              py: 0.5,
              fontSize: 12,
              color: "text.secondary",
            }}
          >
            <PowerGitEventView text={m.text} />
          </Box>
        ) : (
          <Box
            key={m.id}
            data-testid="board-post"
            data-author={m.author}
            sx={{
              border: 1,
              borderColor: "divider",
              borderLeft: 3,
              borderLeftColor: human ? "primary.main" : "var(--pg-agent)",
              borderRadius: 1.5,
              px: 1,
              py: 0.75,
            }}
          >
            <Markdown text={m.text} fold />
          </Box>
        ),
      )}
    </Box>
  )
}

export function PostFeed({
  messages,
  agent,
  onJump,
}: {
  messages: BoardMessage[]
  agent: string | null
  onJump: (id: string) => void
}) {
  const groups = groupPosts(messages)
  return (
    <>
      {groups.map((g) => (
        <PostGroup key={g[0].id} group={g} agent={agent} onJump={onJump} />
      ))}
    </>
  )
}

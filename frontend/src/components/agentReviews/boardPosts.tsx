// The board feed (v0.21.11; v0.21.12 lane design): consecutive posts by the
// same author within five minutes share one node and header (the name, the
// time on the right); round events stand alone as square nodes. A post that
// is about a comment (an asked question, the agent's "c1: …" answer) shows
// the reference as a link to the line instead of the raw prefix. Bodies go
// through Markdown, folded past ~14 lines.
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import type { BoardMessage } from "../../engine"
import { Markdown } from "../Markdown"
import { commentPost, eventKind } from "./boardEvents"
import { AgentDisc, EventNode, LaneItem, OwnerDisc } from "./boardLane"
import { PowerGitEventView } from "./powerGitEventView"
import { clock } from "./roundModel"

const GROUP_WINDOW_MS = 5 * 60 * 1000

type Group = { event: boolean; messages: BoardMessage[] }

function groupPosts(messages: BoardMessage[]): Group[] {
  const groups: Group[] = []
  for (const m of messages) {
    const event = m.author === "powergit" || eventKind(m.text) !== null
    const last = groups[groups.length - 1]
    const prev = last?.messages[last.messages.length - 1]
    if (
      !event &&
      last &&
      !last.event &&
      prev &&
      prev.author === m.author &&
      Date.parse(m.at) - Date.parse(prev.at) <= GROUP_WINDOW_MS
    ) {
      last.messages.push(m)
    } else {
      groups.push({ event, messages: [m] })
    }
  }
  return groups
}

const timeSx = { fontSize: 11, color: "text.secondary", ml: "auto", pl: 1, fontVariantNumeric: "tabular-nums" } as const

export function RefLink({ id, onJump }: { id: string; onJump: (id: string) => void }) {
  return (
    <Box
      component="button"
      data-testid="board-ref"
      title="Show the line"
      onClick={() => onJump(id)}
      sx={{
        border: 1,
        borderColor: "divider",
        bgcolor: "transparent",
        color: "primary.main",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 11,
        fontWeight: 600,
        lineHeight: "16px",
        px: 0.6,
        borderRadius: 1,
        "&:hover": { bgcolor: "action.hover", borderColor: "primary.main" },
        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" },
      }}
    >
      {id}
    </Box>
  )
}

function EventItem({ message }: { message: BoardMessage }) {
  return (
    <LaneItem node={<EventNode kind={eventKind(message.text) ?? "closed"} />}>
      <Box data-testid="board-post" data-author={message.author} sx={{ minWidth: 0, pt: "2px" }}>
        <PowerGitEventView text={message.text} at={clock(message.at)} />
      </Box>
    </LaneItem>
  )
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
  return (
    <LaneItem node={human ? <OwnerDisc /> : <AgentDisc name={first.author} />}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, minHeight: 22, minWidth: 0 }}>
        <Typography
          noWrap
          sx={{ fontWeight: 600, fontSize: 12.5, color: human ? "text.primary" : "var(--pg-agent)", lineHeight: "22px" }}
        >
          {human ? "You" : first.author}
        </Typography>
        {!human && first.author !== agent && (
          <Typography noWrap sx={{ fontSize: 11, color: "text.secondary" }}>
            on the channel
          </Typography>
        )}
        <Typography sx={timeSx}>{clock(first.at)}</Typography>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {group.map((m) => {
          const post = commentPost(m.text)
          return (
            <Box key={m.id} data-testid="board-post" data-author={m.author} sx={{ minWidth: 0 }}>
              {post.ref && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.25 }}>
                  <RefLink id={post.ref} onJump={onJump} />
                  {post.where && (
                    <Typography noWrap sx={{ fontSize: 11.5, color: "text.secondary", minWidth: 0 }}>
                      {post.where}
                    </Typography>
                  )}
                </Box>
              )}
              <Markdown text={post.body} fold />
            </Box>
          )
        })}
      </Box>
    </LaneItem>
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
  return (
    <>
      {groupPosts(messages).map((g) =>
        g.event ? (
          <EventItem key={g.messages[0].id} message={g.messages[0]} />
        ) : (
          <PostGroup key={g.messages[0].id} group={g.messages} agent={agent} onJump={onJump} />
        ),
      )}
    </>
  )
}

// The board as one lane (v0.21.12; owner: "make the right panel looking a
// bit better. Right now it's looking rough"): the conversation drawn like a
// branch of the commit graph PowerGit is built around — a thin line down the
// left, round events as square nodes, the people as discs, the posts as plain
// text beside them. Nothing is boxed but code.
import PersonIcon from "@mui/icons-material/Person"
import Box from "@mui/material/Box"
import { initialsOf, type EventKind } from "./boardEvents"

/** Width of the lane's gutter; the line runs down its middle. */
const GUTTER = 28
const NODE = 22

export function LaneItem({ node, children }: { node: React.ReactNode; children: React.ReactNode }) {
  return (
    <Box
      data-lane-item=""
      sx={{
        position: "relative",
        pl: `${GUTTER}px`,
        pb: 1.75,
        minWidth: 0,
        // The line: from the top of this item to the top of the next. The
        // first starts at its node, the last stops at its node.
        "&::before": {
          content: '""',
          position: "absolute",
          left: NODE / 2 - 1,
          top: 0,
          bottom: 0,
          width: 2,
          bgcolor: "var(--pg-board-lane, rgba(127, 127, 127, 0.3))",
        },
        "&:first-of-type::before": { top: NODE / 2 },
        "&:last-of-type::before": { bottom: "auto", height: NODE / 2 },
        "&:only-of-type::before": { display: "none" },
      }}
    >
      <Box
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          width: NODE,
          height: NODE,
          display: "grid",
          placeItems: "center",
        }}
      >
        {node}
      </Box>
      {children}
    </Box>
  )
}

const ring = "0 0 0 3px var(--pg-board-bg, #fff)"

export function AgentDisc({ name, size = NODE }: { name: string; size?: number }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        bgcolor: "var(--pg-agent-bg)",
        color: "var(--pg-agent)",
        border: "1px solid",
        borderColor: "var(--pg-agent)",
        fontSize: size > 20 ? 9.5 : 9,
        fontWeight: 700,
        letterSpacing: 0.2,
        boxShadow: ring,
        flexShrink: 0,
      }}
    >
      {initialsOf(name)}
    </Box>
  )
}

export function OwnerDisc() {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        width: NODE,
        height: NODE,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        bgcolor: "var(--pg-review-ok-bg)",
        color: "primary.main",
        border: "1px solid",
        borderColor: "primary.main",
        boxShadow: ring,
        "& svg": { fontSize: 14 },
      }}
    >
      <PersonIcon />
    </Box>
  )
}

const EVENT_FILL: Record<EventKind, string> = {
  opened: "var(--pg-board-bg, #fff)",
  sent: "text.primary",
  approved: "var(--pg-review-accept)",
  cancelled: "text.disabled",
  closed: "text.disabled",
}

/** A round event: a square, like a commit node — hollow when a round opens, filled when it goes back. */
export function EventNode({ kind }: { kind: EventKind }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        width: 10,
        height: 10,
        borderRadius: "2px",
        border: 2,
        borderColor:
          kind === "approved" ? "var(--pg-review-accept)" : kind === "opened" ? "text.secondary" : EVENT_FILL[kind],
        bgcolor: EVENT_FILL[kind],
        boxShadow: ring,
      }}
    />
  )
}

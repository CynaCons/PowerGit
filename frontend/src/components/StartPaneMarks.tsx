import CallSplitIcon from "@mui/icons-material/CallSplit"
import Box from "@mui/material/Box"
import { alpha } from "@mui/material/styles"
import type { ReactNode } from "react"
import type { MatchRange } from "./recentsModel"

// The two small painters of the start pane's list: the branch chip and the
// highlight over what the filter matched. They live here so StartPane.tsx
// stays under the 400-line cap.

export function Branch({ text, range }: { text?: string; range: MatchRange | null }) {
  return text ? (
    <Box
      component="span"
      className="ref"
      data-testid="start-branch"
      title={text}
      sx={{
        minWidth: 0,
        maxWidth: "100%",
        // The chip grows instead of cutting the name off (owner, 2026-09-22:
        // "I would like to have the branch names longer if possible, so
        // separate row for the rest would be good"): the name wraps onto a
        // second line, three at most so one long branch cannot push the rest
        // of the list down a screen. Three, not two: CI's font metrics put
        // a 54-character branch on a third line where this machine's fit it
        // on two, and a clipped name is the thing the owner reported.
        height: "auto",
        minHeight: 18,
        alignItems: "flex-start",
        py: "1px",
        lineHeight: "16px",
        borderRadius: "9px",
        fontSize: 11,
      }}
    >
      <CallSplitIcon sx={{ mt: "2px" }} />
      <Box
        component="span"
        sx={{
          minWidth: 0,
          whiteSpace: "normal",
          // A branch name has no spaces to break at, so it breaks anywhere.
          wordBreak: "break-all",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        <Marked text={text} range={range} />
      </Box>
    </Box>
  ) : null
}

export function Marked({ text, range }: { text: string; range: MatchRange | null }): ReactNode {
  if (!range) return text
  return (
    <>
      {text.slice(0, range.start)}
      <Box
        component="mark"
        data-testid="start-match"
        sx={{
          bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.28 : 0.16),
          color: "inherit",
          borderRadius: "2px",
        }}
      >
        {text.slice(range.start, range.end)}
      </Box>
      {text.slice(range.end)}
    </>
  )
}

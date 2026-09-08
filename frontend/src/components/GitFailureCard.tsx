import Box from "@mui/material/Box"
import ButtonBase from "@mui/material/ButtonBase"
import Paper from "@mui/material/Paper"
import Tooltip from "@mui/material/Tooltip"
import CloseIcon from "@mui/icons-material/Close"
import PushPinIcon from "@mui/icons-material/PushPin"
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined"
import { useEffect, useState } from "react"
import type { GitLogEntry } from "../engine"
import { entryOutput, firstLines, formatExit } from "./gitLogModel"

/** How long an unpinned card stays before it takes itself away. */
export const FAILURE_CARD_MS = 5_000

/**
 * v0.15.1, prototype "B", layered on failures only: when a git command
 * fails, one small card appears in the bottom-right with the command and the
 * first lines of its output, and leaves after ~5 s unless it is pinned.
 * Successes are silent — they simply land in the console.
 *
 * It sits above the status bar and the console dock line (bottom: 52) so it
 * never covers either of them.
 */
export function GitFailureCard({
  entry,
  onDismiss,
  onOpenConsole,
}: {
  entry: GitLogEntry | null
  onDismiss: () => void
  onOpenConsole: () => void
}) {
  const [pinned, setPinned] = useState(false)
  const entryId = entry?.id ?? null

  // A new failure is a new card: it starts unpinned and its own 5 s.
  useEffect(() => {
    setPinned(false)
  }, [entryId])

  useEffect(() => {
    if (entryId === null || pinned) return
    const timer = window.setTimeout(onDismiss, FAILURE_CARD_MS)
    return () => window.clearTimeout(timer)
  }, [entryId, pinned, onDismiss])

  if (!entry) return null

  return (
    <Paper
      data-testid="git-failure-card"
      data-pinned={pinned ? "true" : "false"}
      elevation={6}
      role="alert"
      sx={{
        position: "fixed",
        right: 12,
        bottom: 52,
        zIndex: (t) => t.zIndex.snackbar,
        width: 380,
        maxWidth: "calc(100vw - 24px)",
        p: 1,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        bgcolor: "var(--pg-console-bg)",
        color: "var(--pg-console-text)",
        border: "1px solid var(--pg-console-fail)",
        borderRadius: 1,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Box component="span" sx={{ fontSize: 11, fontWeight: 700, color: "var(--pg-console-fail)", flexShrink: 0 }}>
          {`git failed — ${formatExit(entry)}`}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={pinned ? "Unpin" : "Keep this card"}>
          <ButtonBase
            data-testid="git-failure-pin"
            aria-label={pinned ? "Unpin this failure" : "Keep this failure on screen"}
            aria-pressed={pinned}
            onClick={() => setPinned((p) => !p)}
            sx={cardIconSx}
          >
            {pinned ? <PushPinIcon sx={{ fontSize: 14 }} /> : <PushPinOutlinedIcon sx={{ fontSize: 14 }} />}
          </ButtonBase>
        </Tooltip>
        <ButtonBase
          data-testid="git-failure-dismiss"
          aria-label="Dismiss this failure"
          onClick={onDismiss}
          sx={cardIconSx}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </ButtonBase>
      </Box>
      <Box
        component="span"
        data-testid="git-failure-command"
        sx={{ fontFamily: "var(--pg-font-mono)", fontSize: 11, wordBreak: "break-all" }}
      >
        {entry.command}
      </Box>
      {entryOutput(entry).trim().length > 0 && (
        <Box
          component="pre"
          data-testid="git-failure-output"
          sx={{
            m: 0,
            fontFamily: "var(--pg-font-mono)",
            fontSize: 11,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: "var(--pg-console-fail)",
          }}
        >
          {firstLines(entryOutput(entry))}
        </Box>
      )}
      <ButtonBase
        data-testid="git-failure-open"
        onClick={() => {
          onOpenConsole()
          onDismiss()
        }}
        sx={{
          alignSelf: "flex-start",
          fontSize: 11,
          color: "var(--pg-console-meta)",
          textDecoration: "underline",
          borderRadius: 0.5,
          px: 0.5,
          "&:hover": { color: "var(--pg-console-text)" },
          "&:focus-visible": { outline: "var(--pg-focus-ring-w) solid var(--pg-focus-ring)" },
        }}
      >
        Open the Git console
      </ButtonBase>
    </Paper>
  )
}

const cardIconSx = {
  flexShrink: 0,
  width: 20,
  height: 20,
  borderRadius: 0.5,
  color: "var(--pg-console-meta)",
  "&:hover": { color: "var(--pg-console-text)" },
  "&:focus-visible": { outline: "var(--pg-focus-ring-w) solid var(--pg-focus-ring)" },
} as const

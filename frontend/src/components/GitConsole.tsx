import Box from "@mui/material/Box"
import ButtonBase from "@mui/material/ButtonBase"
import InputBase from "@mui/material/InputBase"
import Tooltip from "@mui/material/Tooltip"
import CloseIcon from "@mui/icons-material/Close"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import TerminalIcon from "@mui/icons-material/Terminal"
import { useEffect, useMemo, useRef, useState } from "react"
import type { EngineClient, GitLogEntry } from "../engine"
import { shortcutLabel } from "../hotkeys"
import { useGitLog } from "../hooks/useGitLog"
import { copyToClipboard } from "./clipboard"
import { GitFailureCard } from "./GitFailureCard"
import { setGitConsoleState, toggleGitConsole, useGitConsoleState } from "./gitConsoleState"
import {
  copyAllText,
  entryOutput,
  failed,
  filterEntries,
  formatDuration,
  formatExit,
  notableFailure,
} from "./gitLogModel"

/**
 * The Git console (v0.15.1, prototype "D"): a permanent dock line at the very
 * bottom of the window — below the status bar, never over it — showing the
 * last git command, and a panel above it with the rolling log.
 *
 * It is the last child of the app's column, so opening the panel *shortens*
 * the graph instead of floating over it. Dark in both themes, monospace,
 * like a browser's docked console; the colours are `tokens.console`.
 *
 * It also mounts the failure card (prototype "B"), because both surfaces
 * read the same rolling buffer and one poll must feed them.
 */
export function GitConsole({ client, live }: { client: EngineClient; live: boolean }) {
  const { open, height } = useGitConsoleState()
  const feed = useGitLog({ client, live, open })
  const { entries, last, refresh } = feed
  // The badge counts real failures, not the engine's probes: `rev-parse
  // --verify refs/stash` answers "no stash" with exit 1 on every refresh, and
  // a permanently red badge would mean nothing.
  const failures = useMemo(() => entries.filter(notableFailure).length, [entries])

  // Opening should not wait for the next tick of the slow closed-poll.
  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  return (
    <Box
      data-testid="git-console"
      data-open={open ? "true" : "false"}
      sx={{ flexShrink: 0, display: "flex", flexDirection: "column" }}
    >
      {open && <GitConsolePanel entries={entries} height={height} />}
      <ButtonBase
        data-testid="git-console-dock"
        onClick={() => toggleGitConsole()}
        aria-expanded={open}
        aria-label={`Git console${last ? `. Last command ${last.command}` : ""}`}
        title={`Git console (${shortcutLabel("browse.gitConsole")})`}
        sx={{
          height: 22,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          px: 1,
          width: "100%",
          justifyContent: "flex-start",
          bgcolor: "var(--pg-console-line-bg)",
          color: "var(--pg-console-meta)",
          borderTop: "1px solid var(--pg-console-border)",
          fontFamily: "var(--pg-font-mono)",
          fontSize: 11,
          "&:hover": { bgcolor: "var(--pg-console-bg)" },
          "&:focus-visible": { outline: "var(--pg-focus-ring-w) solid var(--pg-focus-ring)", outlineOffset: -1 },
        }}
      >
        <TerminalIcon sx={{ fontSize: 13, flexShrink: 0 }} />
        <Box
          component="span"
          data-testid="git-console-last"
          sx={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "left",
            color: last && notableFailure(last) ? "var(--pg-console-fail)" : "var(--pg-console-text)",
          }}
        >
          {last ? last.command : "Git console"}
        </Box>
        {last && (
          <Box component="span" sx={{ flexShrink: 0, color: "var(--pg-console-meta)" }}>
            {formatDuration(last.durationMs)}
          </Box>
        )}
        <Box
          component="span"
          data-testid="git-console-count"
          data-failures={failures}
          sx={{
            flexShrink: 0,
            minWidth: 18,
            textAlign: "center",
            borderRadius: 1,
            px: 0.5,
            bgcolor: "var(--pg-console-bg)",
            color: failures > 0 ? "var(--pg-console-fail)" : "var(--pg-console-meta)",
            border: "1px solid var(--pg-console-border)",
          }}
        >
          {entries.length}
        </Box>
      </ButtonBase>
      <GitFailureCard
        entry={feed.failure}
        onDismiss={feed.dismissFailure}
        onOpenConsole={() => setGitConsoleState({ open: true })}
      />
    </Box>
  )
}

function GitConsolePanel({ entries, height }: { entries: GitLogEntry[]; height: number }) {
  const [query, setQuery] = useState("")
  const shown = useMemo(() => filterEntries(entries, query), [entries, query])
  const listRef = useRef<HTMLDivElement | null>(null)
  const newestId = entries.length > 0 ? entries[entries.length - 1].id : 0

  // Newest last, so the console follows the tail the way a terminal does —
  // but only when the user is already at the bottom, otherwise reading an
  // older entry would be yanked away by the next `git status`.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (atBottom) el.scrollTop = el.scrollHeight
  }, [newestId, shown.length])

  return (
    <Box
      data-testid="git-console-panel"
      role="region"
      aria-label="Git console"
      sx={{
        height,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: "var(--pg-console-bg)",
        color: "var(--pg-console-text)",
        borderTop: "1px solid var(--pg-console-border)",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1,
          py: 0.25,
          borderBottom: "1px solid var(--pg-console-border)",
          flexShrink: 0,
        }}
      >
        <Box component="span" sx={{ fontSize: 11, fontWeight: 700, color: "var(--pg-console-meta)" }}>
          GIT CONSOLE
        </Box>
        <InputBase
          data-testid="git-console-filter"
          inputProps={{ "aria-label": "Filter git commands" }}
          placeholder="Filter"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{
            flex: 1,
            maxWidth: 320,
            fontFamily: "var(--pg-font-mono)",
            fontSize: 11,
            color: "var(--pg-console-text)",
            bgcolor: "var(--pg-console-line-bg)",
            border: "1px solid var(--pg-console-border)",
            borderRadius: 0.5,
            px: 0.75,
            "& input::placeholder": { color: "var(--pg-console-meta)", opacity: 1 },
          }}
        />
        <Box component="span" data-testid="git-console-shown" sx={{ fontSize: 11, color: "var(--pg-console-meta)" }}>
          {`${shown.length}/${entries.length}`}
        </Box>
        <Tooltip title="Copy the whole console">
          <ButtonBase
            data-testid="git-console-copy"
            aria-label="Copy the whole console"
            onClick={() => void copyToClipboard(copyAllText(shown))}
            sx={consoleIconSx}
          >
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          </ButtonBase>
        </Tooltip>
        <ButtonBase
          data-testid="git-console-close"
          aria-label="Close the Git console"
          onClick={() => setGitConsoleState({ open: false })}
          sx={consoleIconSx}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </ButtonBase>
      </Box>
      <Box
        ref={listRef}
        role="log"
        sx={{ flex: 1, minHeight: 0, overflow: "auto", fontFamily: "var(--pg-font-mono)", fontSize: 11 }}
      >
        {shown.length === 0 && (
          <Box data-testid="git-console-empty" sx={{ p: 1, color: "var(--pg-console-meta)" }}>
            {entries.length === 0 ? "No git commands yet this session." : "Nothing matches that filter."}
          </Box>
        )}
        {shown.map((entry) => (
          <ConsoleRow key={entry.id} entry={entry} />
        ))}
      </Box>
    </Box>
  )
}

const consoleIconSx = {
  flexShrink: 0,
  width: 20,
  height: 20,
  borderRadius: 0.5,
  color: "var(--pg-console-meta)",
  "&:hover": { color: "var(--pg-console-text)" },
  "&:focus-visible": { outline: "var(--pg-focus-ring-w) solid var(--pg-focus-ring)" },
} as const

function ConsoleRow({ entry }: { entry: GitLogEntry }) {
  const bad = failed(entry)
  const output = entryOutput(entry)
  return (
    <Box
      data-testid="git-console-entry"
      data-exit={entry.exitCode}
      data-failed={bad ? "true" : "false"}
      sx={{ px: 1, py: 0.25, borderBottom: "1px solid var(--pg-console-border)" }}
    >
      <Box sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
        <Box component="span" sx={{ color: "var(--pg-console-meta)", flexShrink: 0 }}>
          $
        </Box>
        <Box
          component="span"
          data-testid="git-console-command"
          sx={{ flex: 1, minWidth: 0, wordBreak: "break-all", color: "var(--pg-console-text)" }}
        >
          {entry.command}
        </Box>
        <Box component="span" sx={{ flexShrink: 0, color: bad ? "var(--pg-console-fail)" : "var(--pg-console-ok)" }}>
          {formatExit(entry)}
        </Box>
        <Box component="span" sx={{ flexShrink: 0, color: "var(--pg-console-meta)" }}>
          {formatDuration(entry.durationMs)}
        </Box>
      </Box>
      {output.trim().length > 0 && (
        <Box
          component="pre"
          data-testid="git-console-output"
          sx={{
            m: 0,
            mt: 0.25,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: bad ? "var(--pg-console-fail)" : "var(--pg-console-meta)",
            maxHeight: 160,
            overflow: "auto",
          }}
        >
          {output}
        </Box>
      )}
    </Box>
  )
}

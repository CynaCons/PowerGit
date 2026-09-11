import Box from "@mui/material/Box"
import ButtonBase from "@mui/material/ButtonBase"
import Tooltip from "@mui/material/Tooltip"
import CloseIcon from "@mui/icons-material/Close"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import TerminalIcon from "@mui/icons-material/Terminal"
import { useEffect, useMemo, useState, type ChangeEvent } from "react"
import type { EngineClient, GitLogEntry } from "../engine"
import { shortcutLabel } from "../hotkeys"
import { useGitLog } from "../hooks/useGitLog"
import { copyToClipboard } from "./clipboard"
import { GitFailureCard } from "./GitFailureCard"
import { AppLogView } from "./AppLogView"
import { copyAppLogText, filterDiagnostics, useDiagnostics } from "./appLogModel"
import { setGitConsoleState, toggleGitConsole, useGitConsoleState, type ConsoleTab } from "./gitConsoleState"
import { GitLogList, PinnedFailure } from "./GitConsoleRows"
import { copyAllText, filterEntries, formatDuration, newestAction, notableFailure, pinnedFailure } from "./gitLogModel"

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
 *
 * v0.16.0, owner: "there's always tons of stuff in that window, I can't even
 * see my push when I push." The panel now reads newest first, keeps what the
 * user did as rows and folds the engine's own reads into one thin row per
 * gap; a failed action stays pinned at the top until dismissed; "Show all"
 * brings the flat log back. The dock line names the last thing the user
 * did, not the `git status` the refresh ran right after it.
 */
export function GitConsole({ client, live }: { client: EngineClient; live: boolean }) {
  const { open, height, tab, showAll } = useGitConsoleState()
  const feed = useGitLog({ client, live, open })
  const { entries, last, refresh } = feed
  // The badge counts real failures, not the engine's probes: `rev-parse
  // --verify refs/stash` answers "no stash" with exit 1 on every refresh, and
  // a permanently red badge would mean nothing.
  const failures = useMemo(() => entries.filter(notableFailure).length, [entries])
  const lastAction = useMemo(() => newestAction(entries), [entries])
  const dockEntry = lastAction ?? last

  // The pin is dismissed per repository: ids restart with the engine's
  // buffer, so a dismissal from another repository must not hide a fresh
  // failure here. Derived, not an effect, so a repo switch needs no reset.
  const [dismissedPin, setDismissedPin] = useState<{ repoId: string | null; id: number }>({ repoId: null, id: 0 })
  const pinned = useMemo(
    () => pinnedFailure(entries, dismissedPin.repoId === client.repoId ? dismissedPin.id : 0),
    [entries, dismissedPin, client.repoId],
  )

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
      {open && (
        <GitConsolePanel
          entries={entries}
          height={height}
          tab={tab}
          showAll={showAll}
          pinned={pinned}
          onDismissPin={() => pinned && setDismissedPin({ repoId: client.repoId, id: pinned.id })}
        />
      )}
      <ButtonBase
        data-testid="git-console-dock"
        onClick={() => toggleGitConsole()}
        aria-expanded={open}
        aria-label={`Git console${dockEntry ? `. Last command ${dockEntry.command}` : ""}`}
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
            color: dockEntry && notableFailure(dockEntry) ? "var(--pg-console-fail)" : "var(--pg-console-text)",
          }}
        >
          {dockEntry ? dockEntry.command : "Git console"}
        </Box>
        {dockEntry && (
          <Box component="span" sx={{ flexShrink: 0, color: "var(--pg-console-meta)" }}>
            {formatDuration(dockEntry.durationMs)}
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

function GitConsolePanel({
  entries,
  height,
  tab,
  showAll,
  pinned,
  onDismissPin,
}: {
  entries: GitLogEntry[]
  height: number
  tab: ConsoleTab
  showAll: boolean
  pinned: GitLogEntry | null
  onDismissPin: () => void
}) {
  // One filter box per tab: switching tabs should not carry "fatal" over to
  // a log where it means nothing.
  const [queries, setQueries] = useState<Record<ConsoleTab, string>>({ git: "", app: "" })
  const query = queries[tab]
  const setQuery = (q: string) => setQueries((all) => ({ ...all, [tab]: q }))
  const diagnostics = useDiagnostics()
  const shown = useMemo(() => filterEntries(entries, query), [entries, query])
  const shownApp = useMemo(() => filterDiagnostics(diagnostics, query), [diagnostics, query])
  const app = tab === "app"
  const total = app ? diagnostics.length : entries.length
  const count = app ? shownApp.length : shown.length

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
        <ConsoleTabButton tab="git" active={!app} label="GIT" />
        <ConsoleTabButton tab="app" active={app} label="APP LOG" />
        <Box component="span" sx={{ width: 4 }} />
        {/* A bare input, not InputBase: the console is its own dark surface
            and a test needs the testid on the element it types into. */}
        <Box
          component="input"
          data-testid="git-console-filter"
          aria-label={app ? "Filter the app log" : "Filter git commands"}
          placeholder="Filter"
          value={query}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          sx={{
            flex: 1,
            minWidth: 0,
            maxWidth: 320,
            height: 18,
            fontFamily: "var(--pg-font-mono)",
            fontSize: 11,
            color: "var(--pg-console-text)",
            bgcolor: "var(--pg-console-line-bg)",
            border: "1px solid var(--pg-console-border)",
            borderRadius: 0.5,
            px: 0.75,
            outline: "none",
            "&::placeholder": { color: "var(--pg-console-meta)", opacity: 1 },
            "&:focus-visible": { outline: "var(--pg-focus-ring-w) solid var(--pg-focus-ring)" },
          }}
        />
        <Box component="span" data-testid="git-console-shown" sx={{ fontSize: 11, color: "var(--pg-console-meta)" }}>
          {`${count}/${total}`}
        </Box>
        {!app && (
          <Tooltip title={showAll ? "Fold the engine's own reads away again" : "Every git command, reads included"}>
            <ButtonBase
              data-testid="git-console-show-all"
              aria-pressed={showAll}
              onClick={() => setGitConsoleState({ showAll: !showAll })}
              sx={{
                flexShrink: 0,
                px: 0.75,
                height: 18,
                borderRadius: 0.5,
                fontSize: 11,
                letterSpacing: 0.2,
                color: showAll ? "var(--pg-console-text)" : "var(--pg-console-meta)",
                bgcolor: showAll ? "var(--pg-console-line-bg)" : "transparent",
                border: "1px solid",
                borderColor: showAll ? "var(--pg-console-meta)" : "var(--pg-console-border)",
                "&:hover": { color: "var(--pg-console-text)" },
                "&:focus-visible": { outline: "var(--pg-focus-ring-w) solid var(--pg-focus-ring)" },
              }}
            >
              Show all
            </ButtonBase>
          </Tooltip>
        )}
        <Tooltip title={app ? "Copy the whole app log" : "Copy the whole console"}>
          <ButtonBase
            data-testid="git-console-copy"
            aria-label={app ? "Copy the whole app log" : "Copy the whole console"}
            onClick={() => void copyToClipboard(app ? copyAppLogText(shownApp) : copyAllText(shown))}
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
      {app ? (
        <AppLogView entries={diagnostics} query={query} />
      ) : (
        <>
          {pinned && <PinnedFailure entry={pinned} onDismiss={onDismissPin} />}
          <GitLogList entries={entries} shown={shown} flat={showAll || query.trim().length > 0} />
        </>
      )}
    </Box>
  )
}

/** GIT | APP LOG. The active one is bright; the other reads as a control. */
function ConsoleTabButton({ tab, active, label }: { tab: ConsoleTab; active: boolean; label: string }) {
  return (
    <ButtonBase
      data-testid={`console-tab-${tab}`}
      aria-pressed={active}
      onClick={() => setGitConsoleState({ tab })}
      sx={{
        flexShrink: 0,
        px: 0.75,
        height: 18,
        borderRadius: 0.5,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.4,
        color: active ? "var(--pg-console-text)" : "var(--pg-console-meta)",
        bgcolor: active ? "var(--pg-console-line-bg)" : "transparent",
        "&:hover": { color: "var(--pg-console-text)" },
        "&:focus-visible": { outline: "var(--pg-focus-ring-w) solid var(--pg-focus-ring)" },
      }}
    >
      {label}
    </ButtonBase>
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

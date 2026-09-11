import Box from "@mui/material/Box"
import ButtonBase from "@mui/material/ButtonBase"
import CloseIcon from "@mui/icons-material/Close"
import { useMemo, useState } from "react"
import type { GitLogEntry } from "../engine"
import {
  entryKind,
  entryOutput,
  failed,
  formatDuration,
  formatExit,
  groupEntries,
  newestAction,
  outputSummary,
  type EntryKind,
} from "./gitLogModel"

// The rows of the Git console's git tab (v0.16.0), out of GitConsole.tsx so
// the dock line, the panel chrome and the log itself each stay readable.
// Owner: "there's always tons of stuff in that window, I can't even see my
// push when I push. Hard to understand where my stuff is."

/**
 * The git tab's rows. Flat (Show all, or while a filter is typed — a search
 * hit must never hide inside a fold) is every entry newest first, output
 * under each, the v0.15 look. Folded is the default: the user's actions as
 * rows, the newest one with its whole output, and the engine's reads
 * between them as one "N background commands" row that opens on click.
 */
export function GitLogList({ entries, shown, flat }: { entries: GitLogEntry[]; shown: GitLogEntry[]; flat: boolean }) {
  const rows = useMemo(() => groupEntries(entries), [entries])
  const newestId = useMemo(() => newestAction(entries)?.id ?? 0, [entries])
  // Rows the user flipped away from their default, and gaps the user opened;
  // both keyed by id so a poll that appends does not undo a click.
  const [flipped, setFlipped] = useState<ReadonlySet<number>>(() => new Set())
  const [openGaps, setOpenGaps] = useState<ReadonlySet<number>>(() => new Set())
  const flip = (id: number) =>
    setFlipped((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleGap = (key: number) =>
    setOpenGaps((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const expandedFor = (entry: GitLogEntry) => (entry.id === newestId) !== flipped.has(entry.id)

  return (
    <Box
      role="log"
      data-testid="git-console-list"
      data-flat={flat ? "true" : "false"}
      sx={{ flex: 1, minHeight: 0, overflow: "auto", fontFamily: "var(--pg-font-mono)", fontSize: 11 }}
    >
      {shown.length === 0 && (
        <Box data-testid="git-console-empty" sx={{ p: 1, color: "var(--pg-console-meta)" }}>
          {entries.length === 0 ? "No git commands yet this session." : "Nothing matches that filter."}
        </Box>
      )}
      {flat
        ? [...shown]
            .reverse()
            .map((entry) => <ConsoleRow key={entry.id} entry={entry} kind={entryKind(entry)} expanded />)
        : rows.map((row) =>
            row.kind === "entry" ? (
              <ConsoleRow
                key={row.entry.id}
                entry={row.entry}
                kind={row.entryKind}
                expanded={expandedFor(row.entry)}
                emphasis={row.entry.id === newestId}
                onToggle={() => flip(row.entry.id)}
              />
            ) : (
              <GapRow
                key={`gap-${row.key}`}
                entries={row.entries}
                open={openGaps.has(row.key)}
                onToggle={() => toggleGap(row.key)}
                expandedFor={(e) => flipped.has(e.id)}
                onFlip={flip}
              />
            ),
          )}
    </Box>
  )
}

/** "N background commands": one thin row for a run of the engine's own reads. */
function GapRow({
  entries,
  open,
  onToggle,
  expandedFor,
  onFlip,
}: {
  entries: GitLogEntry[]
  open: boolean
  onToggle: () => void
  expandedFor: (e: GitLogEntry) => boolean
  onFlip: (id: number) => void
}) {
  const n = entries.length
  const failures = entries.filter(failed).length
  return (
    <>
      <ButtonBase
        data-testid="git-console-gap"
        data-count={n}
        aria-expanded={open}
        onClick={onToggle}
        sx={{
          display: "flex",
          width: "100%",
          justifyContent: "flex-start",
          alignItems: "center",
          gap: 1,
          height: 18,
          px: 1,
          fontFamily: "inherit",
          fontSize: 11,
          color: "var(--pg-console-meta)",
          borderBottom: "1px solid var(--pg-console-border)",
          "&:hover": { color: "var(--pg-console-text)", bgcolor: "var(--pg-console-line-bg)" },
          "&:focus-visible": { outline: "var(--pg-focus-ring-w) solid var(--pg-focus-ring)", outlineOffset: -1 },
        }}
      >
        <Box component="span" sx={{ width: 10, flexShrink: 0, textAlign: "center" }}>
          {open ? "▾" : "▸"}
        </Box>
        <Box component="span" sx={{ fontStyle: "italic" }}>
          {`${n} background command${n === 1 ? "" : "s"}`}
        </Box>
        {failures > 0 && (
          <Box component="span" sx={{ color: "var(--pg-console-meta)" }}>
            {`(${failures} answered no)`}
          </Box>
        )}
      </ButtonBase>
      {open &&
        entries.map((entry) => (
          <ConsoleRow
            key={entry.id}
            entry={entry}
            kind="background"
            expanded={expandedFor(entry)}
            onToggle={() => onFlip(entry.id)}
            inset
          />
        ))}
    </>
  )
}

/**
 * A failed action, kept at the top of the panel with its whole output until
 * the user closes it. The corner card says it once and leaves; this stays.
 */
export function PinnedFailure({ entry, onDismiss }: { entry: GitLogEntry; onDismiss: () => void }) {
  const output = entryOutput(entry)
  return (
    <Box
      data-testid="git-console-pinned"
      data-entry-id={entry.id}
      role="alert"
      sx={{
        flexShrink: 0,
        px: 1,
        py: 0.5,
        borderBottom: "1px solid var(--pg-console-fail)",
        borderLeft: "3px solid var(--pg-console-fail)",
        bgcolor: "var(--pg-console-line-bg)",
        fontFamily: "var(--pg-font-mono)",
        fontSize: 11,
        display: "flex",
        flexDirection: "column",
        gap: 0.25,
        maxHeight: "55%",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box component="span" sx={{ fontWeight: 700, color: "var(--pg-console-fail)", flexShrink: 0 }}>
          {`git failed — ${formatExit(entry)}`}
        </Box>
        <Box
          component="span"
          data-testid="git-console-pinned-command"
          sx={{ flex: 1, minWidth: 0, wordBreak: "break-all", color: "var(--pg-console-text)" }}
        >
          {entry.command}
        </Box>
        <Box component="span" sx={{ flexShrink: 0, color: "var(--pg-console-meta)" }}>
          {formatDuration(entry.durationMs)}
        </Box>
        <ButtonBase
          data-testid="git-console-pin-dismiss"
          aria-label="Dismiss this failure"
          onClick={onDismiss}
          sx={consoleIconSx}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </ButtonBase>
      </Box>
      {output.trim().length > 0 && (
        <Box
          component="pre"
          data-testid="git-console-pinned-output"
          sx={{
            m: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: "var(--pg-console-fail)",
            minHeight: 0,
            overflow: "auto",
          }}
        >
          {output}
        </Box>
      )}
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

/**
 * One entry. `expanded` shows the output as a block; folded shows its first
 * line and how much more there is. With `onToggle` the header line is a
 * button that flips it. `emphasis` is the newest action: the row the owner
 * is looking for, so its output gets room and its edge is lit.
 */
function ConsoleRow({
  entry,
  kind,
  expanded,
  emphasis = false,
  inset = false,
  onToggle,
}: {
  entry: GitLogEntry
  kind: EntryKind
  expanded: boolean
  emphasis?: boolean
  inset?: boolean
  onToggle?: () => void
}) {
  const bad = failed(entry)
  const output = entryOutput(entry)
  const hasOutput = output.trim().length > 0
  const summary = hasOutput && !expanded ? outputSummary(output) : null
  const header = (
    <>
      {onToggle && (
        <Box component="span" sx={{ width: 10, flexShrink: 0, textAlign: "center", color: "var(--pg-console-meta)" }}>
          {hasOutput ? (expanded ? "▾" : "▸") : ""}
        </Box>
      )}
      <Box component="span" sx={{ color: "var(--pg-console-meta)", flexShrink: 0 }}>
        $
      </Box>
      <Box
        component="span"
        data-testid="git-console-command"
        sx={{
          flex: 1,
          minWidth: 0,
          wordBreak: "break-all",
          textAlign: "left",
          color: kind === "action" ? "var(--pg-console-text)" : "var(--pg-console-meta)",
          fontWeight: emphasis ? 700 : 400,
        }}
      >
        {entry.command}
      </Box>
      <Box component="span" sx={{ flexShrink: 0, color: bad ? "var(--pg-console-fail)" : "var(--pg-console-ok)" }}>
        {formatExit(entry)}
      </Box>
      <Box component="span" sx={{ flexShrink: 0, color: "var(--pg-console-meta)" }}>
        {formatDuration(entry.durationMs)}
      </Box>
    </>
  )
  const headerSx = { display: "flex", gap: 1, alignItems: "baseline", width: "100%" } as const
  return (
    <Box
      data-testid="git-console-entry"
      data-exit={entry.exitCode}
      data-failed={bad ? "true" : "false"}
      data-kind={kind}
      data-expanded={expanded ? "true" : "false"}
      sx={{
        pl: inset ? 3 : 1,
        pr: 1,
        py: 0.25,
        borderBottom: "1px solid var(--pg-console-border)",
        borderLeft: "3px solid",
        borderLeftColor: bad
          ? "var(--pg-console-fail)"
          : emphasis
            ? "var(--pg-console-ok)"
            : kind === "action"
              ? "var(--pg-console-meta)"
              : "transparent",
      }}
    >
      {onToggle ? (
        <ButtonBase
          onClick={onToggle}
          aria-expanded={expanded}
          disableRipple
          sx={{
            ...headerSx,
            fontFamily: "inherit",
            fontSize: "inherit",
            textAlign: "left",
            borderRadius: 0.5,
            "&:focus-visible": { outline: "var(--pg-focus-ring-w) solid var(--pg-focus-ring)", outlineOffset: -1 },
          }}
        >
          {header}
        </ButtonBase>
      ) : (
        <Box sx={headerSx}>{header}</Box>
      )}
      {hasOutput && expanded && (
        <Box
          component="pre"
          data-testid="git-console-output"
          sx={{
            m: 0,
            mt: 0.25,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: bad ? "var(--pg-console-fail)" : "var(--pg-console-meta)",
            maxHeight: emphasis ? 320 : 160,
            overflow: "auto",
          }}
        >
          {output}
        </Box>
      )}
      {summary && summary.line.length > 0 && (
        <Box
          data-testid="git-console-summary"
          sx={{
            mt: 0.25,
            pl: onToggle ? 2.25 : 0,
            display: "flex",
            gap: 1,
            color: bad ? "var(--pg-console-fail)" : "var(--pg-console-meta)",
            opacity: 0.85,
          }}
        >
          <Box
            component="span"
            sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {summary.line}
          </Box>
          {summary.more > 0 && (
            <Box component="span" sx={{ flexShrink: 0 }}>
              {`+${summary.more} line${summary.more === 1 ? "" : "s"}`}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

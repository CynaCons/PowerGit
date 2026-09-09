import Box from "@mui/material/Box"
import { useEffect, useMemo, useRef } from "react"
import { getEngineLogPath, recentLongTasks, type DiagnosticEntry } from "../diagnostics"
import { entryTime, filterDiagnostics } from "./appLogModel"

/**
 * The app log (v0.15.3): the diagnostic ring rendered in the console panel,
 * beside the git log.
 *
 * Owner, 2026-09-09: "the fix in 0.15.2 to show the debugger panel did not
 * work." The WebKitGTK inspector refused to open on their Ubuntu, and the
 * ring — errors, unhandled rejections, focus and visibility transitions,
 * refresh timings, long tasks, and since v0.15.3 every console.* call — was
 * only ever rendered by RecoveryPanel, which appears when the app is already
 * broken. This shows the same evidence on demand, without devtools.
 */

// `console.ok` is the green the git log uses for a command that succeeded, so
// it cannot stand in for a warning — green reads as "fine". v0.15.3 gave the
// console surface its own amber for exactly this row.
const LEVEL_COLOUR: Record<DiagnosticEntry["level"], string> = {
  info: "var(--pg-console-text)",
  warn: "var(--pg-console-warn)",
  error: "var(--pg-console-fail)",
}

export function AppLogView({ entries, query }: { entries: readonly DiagnosticEntry[]; query: string }) {
  const shown = useMemo(() => filterDiagnostics(entries, query), [entries, query])
  const listRef = useRef<HTMLDivElement | null>(null)
  const logPath = getEngineLogPath()
  const longTasks = recentLongTasks()

  // Follow the tail only when the reader is already there, so scrolling back
  // to read an error is not yanked away by the next entry.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) el.scrollTop = el.scrollHeight
  }, [shown.length])

  return (
    <Box
      ref={listRef}
      role="log"
      data-testid="app-log-list"
      sx={{ flex: 1, minHeight: 0, overflow: "auto", fontFamily: "var(--pg-font-mono)", fontSize: 11 }}
    >
      {shown.length === 0 && (
        <Box data-testid="app-log-empty" sx={{ p: 1, color: "var(--pg-console-meta)" }}>
          {entries.length === 0 ? "Nothing logged yet this session." : "Nothing matches that filter."}
        </Box>
      )}
      {shown.map((entry, i) => (
        <Box
          key={`${entry.at}-${i}`}
          data-testid="app-log-entry"
          data-level={entry.level}
          sx={{
            display: "flex",
            gap: 1,
            px: 1,
            py: 0.125,
            borderBottom: "1px solid var(--pg-console-border)",
            color: LEVEL_COLOUR[entry.level],
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          <Box component="span" sx={{ flexShrink: 0, color: "var(--pg-console-meta)" }}>
            {entryTime(entry.at)}
          </Box>
          <Box component="span" sx={{ flexShrink: 0, color: "var(--pg-console-meta)" }}>
            {entry.source}
          </Box>
          <Box component="span" sx={{ minWidth: 0 }}>
            {entry.message}
          </Box>
        </Box>
      ))}
      {(logPath || longTasks.length > 0) && (
        <Box data-testid="app-log-footer" sx={{ p: 1, color: "var(--pg-console-meta)" }}>
          {longTasks.length > 0 && `${longTasks.length} long task${longTasks.length === 1 ? "" : "s"} recorded · `}
          {logPath ? `on disk beside ${logPath}` : "not running in the desktop shell: nothing is written to disk"}
        </Box>
      )}
    </Box>
  )
}

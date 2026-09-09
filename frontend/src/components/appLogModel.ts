import { useSyncExternalStore } from "react"
import { diagnosticsSnapshot, subscribeDiagnostics, type DiagnosticEntry } from "../diagnostics"

// The app log's model, kept out of AppLogView.tsx so the rules are testable
// without a render — the same split as gitLogModel.ts beside GitConsole.tsx
// (v0.15.3).

/** Case-insensitive, every whitespace-separated term must match, like the git log's. */
export function filterDiagnostics(entries: readonly DiagnosticEntry[], query: string): DiagnosticEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...entries]
  return entries.filter((e) => {
    const hay = `${e.level} ${e.source} ${e.message}`.toLowerCase()
    return terms.every((t) => hay.includes(t))
  })
}

/** One entry as plain text — the unit "Copy all" joins. */
export function diagnosticText(entry: DiagnosticEntry): string {
  return `${entry.at} [${entry.level}] ${entry.source}: ${entry.message}`
}

/** The whole log as plain text, for the copy button. */
export function copyAppLogText(entries: readonly DiagnosticEntry[]): string {
  return entries.map(diagnosticText).join("\n")
}

/** The clock part of an ISO timestamp: the date repeats on every row. */
export function entryTime(at: string): string {
  return at.slice(11, 23)
}

/** Live view of the ring; `report` notifies every listener on each entry. */
export function useDiagnostics(): readonly DiagnosticEntry[] {
  return useSyncExternalStore(subscribeDiagnostics, diagnosticsSnapshot, diagnosticsSnapshot)
}

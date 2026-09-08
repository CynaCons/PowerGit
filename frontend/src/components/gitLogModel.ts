import type { GitLogEntry } from "../engine"

// The Git console's model, kept out of GitConsole.tsx so the dock line, the
// panel and the failure card share one set of rules and none of it needs a
// render to test (v0.15.1). The engine already sanitized `command` and
// `output` (GitCommandSanitizer.cs); nothing here may re-widen them.

/** How many entries the buffer holds — the engine's cap, mirrored for the badge. */
export const GIT_LOG_CAPACITY = 50

/** What the engine appends when an entry hit its 8 KB cap. */
export const TRUNCATION_MARKER = "… output truncated"

export const failed = (e: GitLogEntry): boolean => e.exitCode !== 0

// Several git commands answer with a non-zero exit as their *normal* answer,
// and the engine uses them as probes: is there a stash (`rev-parse --verify
// refs/stash`), does this branch have an upstream (`@{upstream}`), is this
// path tracked (`ls-files --error-unmatch`). Those run on every refresh, so
// a failure card on each one would be a permanent nag. They still appear in
// the console — the console shows everything — they just do not pop a card.
const PROBES: readonly RegExp[] = [
  /^git rev-parse\b.*(--verify|@\{upstream\})/,
  /^git rev-list\b.*@\{upstream\}/,
  /^git remote get-url\b/,
  /^git ls-files\b.*--error-unmatch\b/,
  // Any config read, at any scope: `config --get`, `config --local --get`
  // and `config --show-origin --get` all exit 1 when the key is unset, and
  // the settings dialog asks about several keys that usually are.
  /^git config\b(?=.*--get\b)/,
  /^git name-rev\b/,
  /^git submodule status\b/,
  /^git check-ignore\b/,
  /^git merge-base\b.*--is-ancestor\b/,
  /^git diff\b.*--quiet\b/,
]

export const isProbe = (e: GitLogEntry): boolean => PROBES.some((p) => p.test(e.command))

/**
 * What earns the corner failure card: git ran, said no, and the engine was
 * not just asking a question. A negative exit code is the engine's "timed
 * out or cancelled" — usually a read the UI itself abandoned when the
 * selection moved — so it lands in the console silently too.
 */
export const notableFailure = (e: GitLogEntry): boolean => e.exitCode > 0 && !isProbe(e)

/**
 * A duration a human reads at a glance, the way a browser console does:
 * sub-second in ms, then seconds with one decimal, then m/s.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—"
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.round(s - m * 60)}s`
}

/** "exit 0" / "exit 128"; -1 is the engine's "never finished". */
export function formatExit(entry: GitLogEntry): string {
  return entry.exitCode < 0 ? "no exit" : `exit ${entry.exitCode}`
}

/** The entry's output plus the marker the engine's cap earned it. */
export function entryOutput(entry: GitLogEntry): string {
  if (!entry.truncated) return entry.output
  // The engine already appends its own marker; only add one when a caller
  // handed us a flagged entry without it (older engine, or a test double).
  return entry.output.includes(TRUNCATION_MARKER) ? entry.output : `${entry.output}\n${TRUNCATION_MARKER}`
}

/** The first `max` lines of an entry's output — what the failure card shows. */
export function firstLines(text: string, max = 4): string {
  const lines = text.split("\n").filter((l, i) => i === 0 || l.trim().length > 0)
  return lines.slice(0, max).join("\n")
}

/**
 * Filter box: case-insensitive, matches the command or the output, and every
 * whitespace-separated term must match (so "push fatal" finds the failed
 * push). A blank filter keeps everything.
 */
export function filterEntries(entries: readonly GitLogEntry[], query: string): GitLogEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...entries]
  return entries.filter((e) => {
    const hay = `${e.command}\n${e.output}`.toLowerCase()
    return terms.every((t) => hay.includes(t))
  })
}

/** Merges a delta into the buffer, oldest first, capped like the engine's. */
export function mergeEntries(current: readonly GitLogEntry[], delta: readonly GitLogEntry[]): GitLogEntry[] {
  if (delta.length === 0) return [...current]
  const highest = current.length > 0 ? current[current.length - 1].id : 0
  const fresh = delta.filter((e) => e.id > highest)
  if (fresh.length === 0) return [...current]
  const merged = [...current, ...fresh]
  return merged.length > GIT_LOG_CAPACITY ? merged.slice(merged.length - GIT_LOG_CAPACITY) : merged
}

/** One entry as plain text — the unit the copy-all button joins. */
export function entryText(entry: GitLogEntry): string {
  const head = `$ ${entry.command}   [${formatExit(entry)}, ${formatDuration(entry.durationMs)}]`
  const body = entryOutput(entry)
  return body.trim().length > 0 ? `${head}\n${body}` : head
}

/** The whole console as plain text, for "Copy all". */
export function copyAllText(entries: readonly GitLogEntry[]): string {
  return entries.map(entryText).join("\n\n")
}

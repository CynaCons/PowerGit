import type { GitLogEntry } from "../engine"

// The Git console's model, kept out of GitConsole.tsx so the dock line, the
// panel and the failure card share one set of rules and none of it needs a
// render to test (v0.15.1). The engine already sanitized `command` and
// `output` (GitCommandSanitizer.cs); nothing here may re-widen them.

/** How many entries the buffer holds — the engine's cap, mirrored for the badge. */
export const GIT_LOG_CAPACITY = 50

/** What the engine appends when an entry hit its 8 KB cap. */
export const TRUNCATION_MARKER = "… output truncated"

/**
 * The caller's verdict (v0.16.0): the engine says whether the exit code it
 * got was the one it asked for. `git diff --no-index` exits 1 for any new
 * file with content and is still ok — the owner saw "git failed — exit 1"
 * with the new file's diff every time he opened one. A pre-v0.16 engine
 * sends no `ok`; exit 0 stands in for it.
 */
export const isOk = (e: GitLogEntry): boolean => e.ok ?? e.exitCode === 0

export const failed = (e: GitLogEntry): boolean => !isOk(e)

// Several git commands answer with a non-zero exit as their *normal* answer,
// and the engine uses them as probes: is there a stash (`rev-parse --verify
// refs/stash`), does this branch have an upstream (`@{upstream}`), is this
// path tracked (`ls-files --error-unmatch`). Those run on every refresh, so
// a failure card on each one would be a permanent nag. They still appear in
// the console — the console shows everything — they just do not pop a card.
const PROBES: readonly RegExp[] = [
  // `@{u}` is how pull and push ask before running (GitHost.Operations.cs);
  // a first push has no upstream and must not pop a card for asking.
  /^git rev-parse\b.*(--verify|@\{(upstream|u)\})/,
  /^git rev-list\b.*@\{(upstream|u)\}/,
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
export const notableFailure = (e: GitLogEntry): boolean => !isOk(e) && e.exitCode >= 0 && !isProbe(e)

// ---- what the user did versus what the engine did on its own (v0.16.0) ----
//
// Owner: "there's always tons of stuff in that window, I can't even see my
// push when I push. Hard to understand where my stuff is." A refresh is a
// dozen reads; a click on a commit is three more. The console folds those
// away by default and keeps the user's own actions in view.

export type EntryKind = "action" | "background"

/**
 * The git subcommand of a recorded command line, past the global options
 * the engine prepends: `git -c core.quotepath=false diff …` is a diff. The
 * sanitizer quotes an argument with spaces, so quotes are honoured.
 */
export function subcommand(command: string): string {
  const tokens = tokenize(command)
  const at = verbIndex(tokens)
  return at < 0 ? "" : tokens[at]
}

/** Index of the subcommand in the tokens; tokens[0] is "git" itself. */
function verbIndex(tokens: readonly string[]): number {
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t.startsWith("-")) return i
    // Globals that take a separate value: skip it as well.
    if (t === "-c" || t === "-C" || t === "--git-dir" || t === "--work-tree" || t === "--namespace") i++
  }
  return -1
}

function tokenize(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let quoted = false
  let has = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted && ch === "\\" && line[i + 1] === '"') {
      cur += '"'
      i++
    } else if (ch === '"') {
      quoted = !quoted
      has = true
    } else if (!quoted && /\s/.test(ch)) {
      if (has) out.push(cur)
      cur = ""
      has = false
    } else {
      cur += ch
      has = true
    }
  }
  if (has) out.push(cur)
  return out
}

// Reads, plain and simple: whatever the arguments, these change nothing.
const READS = new Set([
  "status",
  "log",
  "rev-parse",
  "ls-files",
  "diff",
  "diff-tree",
  "diff-files",
  "diff-index",
  "show",
  "for-each-ref",
  "cat-file",
  "rev-list",
  "name-rev",
  "merge-base",
  "check-ignore",
  "check-attr",
  "ls-tree",
  "ls-remote",
  "version",
  "describe",
  "blame",
  "annotate",
  "reflog",
  "show-ref",
  "symbolic-ref",
  "count-objects",
  "var",
  "grep",
  "shortlog",
  "cherry",
  "range-diff",
  "show-branch",
  "help",
])

// Subcommands that read or write depending on their arguments. The read
// shapes are listed; anything else on the same verb is treated as done on
// purpose (`git branch topic` creates, `git branch --list` looks).
const LISTING_FLAGS: Record<string, readonly string[]> = {
  branch: [
    "--list",
    "-l",
    "-a",
    "-r",
    "--all",
    "--remotes",
    "--show-current",
    "--contains",
    "--no-contains",
    "--merged",
    "--no-merged",
    "--points-at",
    "-v",
    "-vv",
    "--verbose",
  ],
  tag: ["--list", "-l", "-n", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at"],
  config: ["--get", "--get-all", "--get-regexp", "--list", "-l"],
}

const READ_VERBS: Record<string, readonly string[]> = {
  remote: ["-v", "--verbose", "get-url", "show"],
  stash: ["list", "show"],
  submodule: ["status", "summary"],
  worktree: ["list"],
  notes: ["list", "show"],
}

/**
 * Background = a read the engine ran on its own (a refresh, a selection, a
 * dialog opening); action = something the user asked for. The reads are the
 * closed list: an unknown command is *shown*, because hiding what the user
 * did is the whole complaint and showing one extra read costs a row.
 */
export function entryKind(e: GitLogEntry): EntryKind {
  if (isProbe(e)) return "background"
  const tokens = tokenize(e.command)
  const at = verbIndex(tokens)
  const verb = at < 0 ? "" : tokens[at]
  if (READS.has(verb)) return "background"
  const rest = at < 0 ? [] : tokens.slice(at + 1)
  const listing = LISTING_FLAGS[verb]
  if (listing) {
    // A bare `git branch` / `git tag` / `git config -l` only lists.
    if (rest.length === 0 || rest.some((t) => listing.includes(t))) return "background"
    return "action"
  }
  const readVerbs = READ_VERBS[verb]
  if (readVerbs) {
    const first = rest.find((t) => !t.startsWith("-")) ?? rest[0]
    // `git remote` alone lists; `git stash` alone pushes.
    if (first === undefined) return verb === "stash" ? "action" : "background"
    return readVerbs.includes(first) ? "background" : "action"
  }
  return "action"
}

export const isUserAction = (e: GitLogEntry): boolean => entryKind(e) === "action"

/** The most recent thing the user did, or null when the buffer holds only reads. */
export function newestAction(entries: readonly GitLogEntry[]): GitLogEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isUserAction(entries[i])) return entries[i]
  }
  return null
}

/**
 * The newest failed user action, kept at the top of the console until the
 * user dismisses it; `dismissedId` is the id of the last one dismissed, so
 * only a newer failure pins again. A failed read never pins: the corner
 * card already says so once, and the read is the engine's, not the user's.
 */
export function pinnedFailure(entries: readonly GitLogEntry[], dismissedId: number): GitLogEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.id <= dismissedId) return null
    if (notableFailure(e) && isUserAction(e)) return e
  }
  return null
}

export type ConsoleRowModel =
  { kind: "entry"; entry: GitLogEntry; entryKind: EntryKind } | { kind: "gap"; key: number; entries: GitLogEntry[] }

/**
 * Rows for the default view, newest first: every user action is its own
 * row, and each run of background reads between two actions folds into one
 * gap row. A gap's key is the oldest id in it, so a gap the user expanded
 * stays expanded while the refresh after an action keeps adding to it.
 */
export function groupEntries(entries: readonly GitLogEntry[]): ConsoleRowModel[] {
  const rows: ConsoleRowModel[] = []
  let gap: GitLogEntry[] = []
  const closeGap = () => {
    if (gap.length === 0) return
    const key = gap[0].id
    rows.push({ kind: "gap", key, entries: gap.reverse() })
    gap = []
  }
  for (const entry of entries) {
    const kind = entryKind(entry)
    if (kind === "background") {
      gap.push(entry)
      continue
    }
    closeGap()
    rows.push({ kind: "entry", entry, entryKind: kind })
  }
  closeGap()
  return rows.reverse()
}

/** What a folded row shows of its output: the first line that says anything, and how much is left. */
export function outputSummary(text: string): { line: string; more: number } {
  const lines = text.split("\n").filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { line: "", more: 0 }
  return { line: lines[0], more: lines.length - 1 }
}

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

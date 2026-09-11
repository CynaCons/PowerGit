import type { RevisionFilter } from "../engine"
import type { GraphRow } from "../graph/types"

// The file history view as data (v0.16.0). Owner: "In main view, in the
// file tree, right click a file and show the file history. Here again, we
// have to be functionally equivalent to GE." Git Extensions' FormFileHistory
// is a revision grid limited to one path with a Commit / Diff / View / Blame
// tab strip under it; what is on that strip depends on the selected row
// (FormFileHistory.UpdateSelectedFileViewers), and the four load options are
// AppSettings the form toggles from its menus. Both rules live here so the
// unit test can pin them; FileHistoryView.tsx only draws.

/** GE AppSettings: FollowRenamesInFileHistory, FollowRenamesInFileHistoryExactOnly,
 *  FullHistoryInFileHistory, SimplifyMergesInFileHistory. */
export type FileHistoryOptions = { follow: boolean; exact: boolean; full: boolean; simplify: boolean }

export const DEFAULT_FILE_HISTORY_OPTIONS: FileHistoryOptions = {
  follow: true,
  exact: false,
  full: false,
  simplify: false,
}

export const FILE_HISTORY_OPTIONS_KEY = "powergit.fileHistory.options"

type StorageLike = Pick<Storage, "getItem" | "setItem">

export function readFileHistoryOptions(storage: StorageLike | null): FileHistoryOptions {
  try {
    const raw = storage?.getItem(FILE_HISTORY_OPTIONS_KEY)
    if (!raw) return DEFAULT_FILE_HISTORY_OPTIONS
    const parsed = JSON.parse(raw) as Partial<FileHistoryOptions>
    return {
      follow: typeof parsed.follow === "boolean" ? parsed.follow : DEFAULT_FILE_HISTORY_OPTIONS.follow,
      exact: typeof parsed.exact === "boolean" ? parsed.exact : DEFAULT_FILE_HISTORY_OPTIONS.exact,
      full: typeof parsed.full === "boolean" ? parsed.full : DEFAULT_FILE_HISTORY_OPTIONS.full,
      simplify: typeof parsed.simplify === "boolean" ? parsed.simplify : DEFAULT_FILE_HISTORY_OPTIONS.simplify,
    }
  } catch {
    return DEFAULT_FILE_HISTORY_OPTIONS
  }
}

export function writeFileHistoryOptions(storage: StorageLike | null, options: FileHistoryOptions): void {
  try {
    storage?.setItem(FILE_HISTORY_OPTIONS_KEY, JSON.stringify(options))
  } catch {
    // Storage refused: the choice still applies for this window.
  }
}

/** A path that names a directory (GE: the filter ends with "/"). */
export function isFolderPath(path: string): boolean {
  return path.endsWith("/")
}

/** The engine's filter for a path under the given options. A folder never
 *  follows renames (GE: the pathspec "can be very long for folders"); the
 *  dependent toggles only travel with their parent, as GE's menu enables
 *  them (exact needs follow, simplify needs full). */
export function fileHistoryFilter(path: string, options: FileHistoryOptions): RevisionFilter {
  const follow = options.follow && !isFolderPath(path)
  const filter: RevisionFilter = { path }
  if (!follow) filter.follow = false
  if (follow && options.exact) filter.exact = true
  if (options.full) filter.full = true
  if (options.full && options.simplify) filter.simplify = true
  return filter
}

export type FileHistoryTab = "commit" | "diff" | "view"

/** The tabs GE shows for the selected row (UpdateSelectedFileViewers): a
 *  pending-change row has no commit, so no Commit tab; a folder has no blob
 *  to view; a commit gets Commit, Diff and View. A pending row keeps View
 *  (GE drops it there): it shows the file as the row sees it, on disk or in
 *  the index, like the main File Tree does for that row (owner, 2026-09-11).
 *  Blame is not here because PowerGit has no blame view yet. */
export function fileHistoryTabs(row: GraphRow | undefined, path: string): FileHistoryTab[] {
  if (!row) return ["commit", "diff", "view"]
  if (row.artificial) return isFolderPath(path) ? ["diff"] : ["diff", "view"]
  if (isFolderPath(path)) return ["commit", "diff"]
  return ["commit", "diff", "view"]
}

/** The tab to show: the one asked for when the row offers it, else the
 *  row's first (GE's preferredTab when the selected page was removed). */
export function resolveFileHistoryTab(wanted: FileHistoryTab, available: FileHistoryTab[]): FileHistoryTab {
  return available.includes(wanted) ? wanted : (available[0] ?? "diff")
}

/** The name the file had at this row: what the engine followed, else the
 *  requested path (pending rows are the working tree, i.e. today's name). */
export function pathAtRow(row: GraphRow | undefined, path: string): string {
  if (!row || row.artificial) return path
  return row.rev.path ?? path
}

/** GE SetTitle: "File History - path", with the name at the selected
 *  revision in parentheses when it differs. */
export function fileHistoryTitle(path: string, at: string): string {
  return at !== path ? `${path} (${at})` : path
}

/** How many of the status's files the pending-change rows would stand for
 *  in this history: the file itself, or everything under a folder. Zero
 *  keeps the row off the grid, as in the main view. */
export function pendingCount(path: string, files: readonly { path: string }[]): number {
  if (isFolderPath(path)) return files.filter((f) => f.path.startsWith(path)).length
  return files.filter((f) => f.path === path).length
}

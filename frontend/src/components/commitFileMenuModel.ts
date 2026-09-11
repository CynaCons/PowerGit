import type { StatusFile } from "../engine"
import { shortcutLabel } from "../hotkeys/catalog"

// The commit dialog's file menu as data (v0.16.0). Owner: "on the left we
// have the files staged and unstaged. We need functional parity with what GE
// has. Should be able to right click on my files and do operations on them."
//
// Git Extensions builds this menu in FileStatusList.ContextMenu.cs
// (UpdateStatusOfMenuItems decides what shows) and lays it out in
// FileStatusList.Designer.cs (ItemContextMenu.Items order). PowerGit builds
// the same list here, as a pure model, so the order, the visibility rules and
// the check marks are asserted by a unit test; CommitFileContextMenu.tsx only
// draws what this returns. The mapping of every GE item, including the ones
// this menu leaves out and why, is in docs/agents/context/git-extensions-map.md.

export type FileMenuIcon =
  | "stage"
  | "unstage"
  | "stageAll"
  | "reset"
  | "difftool"
  | "open"
  | "openWith"
  | "edit"
  | "move"
  | "delete"
  | "copy"
  | "folder"
  | "ignore"
  | "exclude"
  | "skip"
  | "assume"
  | "untrack"
  | "show"

export type FileMenuNode = {
  id: string
  label: string
  icon?: FileMenuIcon
  shortcut?: string
  disabled?: boolean
  hidden?: boolean
  /** A separator is drawn above this item (start of a group). */
  divider?: boolean
  /** A check item (GE CheckOnClick): drawn with a check mark when true. */
  checked?: boolean
  /** Why the item is disabled; shown as the item's title. */
  hint?: string
  children?: FileMenuNode[]
}

export type HiddenView = { skipWorktree: boolean; assumeUnchanged: boolean }

export type FileMenuInput = {
  /** Which list was right-clicked: Git Extensions' Staged (index) or Unstaged (work tree) FileStatusList. */
  staged: boolean
  /** The files the action applies to: the selection when the target row is in it, else the target alone. */
  files: StatusFile[]
  /** Rows in that list, for "Stage all" / "Unstage all". */
  listCount: number
  /** Running in the Tauri shell: "Show in folder" needs the opener plugin. */
  shell: boolean
  view: HiddenView
}

/** Untracked files come back from the engine status as "U" (GitHost.GetStatus). */
type Row = Pick<StatusFile, "status">
export const isUntracked = (f: Row) => f.status === "U"
export const isDeleted = (f: Row) => f.status === "D"
export const isConflict = (f: Row) => f.status === "C"
/** A skip-worktree / assume-unchanged file git hides from status, listed via "Show … files" (status "S", "h" or "s"). */
export const isHiddenEntry = (f: Row) => f.status === "S" || f.status === "h" || f.status === "s"

function visible(nodes: FileMenuNode[]): FileMenuNode[] {
  return nodes.filter((n) => !n.hidden).map((n) => (n.children ? { ...n, children: visible(n.children) } : n))
}

export function buildFileMenu(input: FileMenuInput): FileMenuNode[] {
  const { staged, files, listCount, shell, view } = input
  const n = files.length
  const single = n === 1
  const word = single ? "file" : `${n} files`
  const anyTracked = files.some((f) => !isUntracked(f))
  const anyDeleted = files.some(isDeleted)
  const allDeleted = n > 0 && files.every(isDeleted)
  const allHidden = n > 0 && files.every(isHiddenEntry)
  const anyConflict = files.some(isConflict)
  const oneAtATime = "One file at a time."
  const flaggedHint = "Git does not stage a skip-worktree or assume-unchanged file; clear the flag first."

  const nodes: FileMenuNode[] = [
    // --- git (GE sepGit group) ---------------------------------------------
    {
      id: "ctx-stage-selected",
      label: staged ? `Unstage ${word}` : `Stage ${word}`,
      icon: staged ? "unstage" : "stage",
      shortcut: shortcutLabel(staged ? "diff.unstageSelected" : "diff.stageSelected"),
      disabled: allHidden,
      hint: allHidden ? flaggedHint : undefined,
    },
    {
      id: "ctx-stage-all",
      label: staged ? "Unstage all" : "Stage all",
      icon: "stageAll",
      disabled: listCount === 0,
    },
    {
      // GE "Reset file(s) to" with First/Second: the Unstaged list can go
      // back to the index (GE "First: A Index") or all the way to HEAD; the
      // Staged list's First is HEAD. PowerGit's engine scopes (v0.15.5):
      // "worktree" and "head". Untracked files are deleted by either (owner's
      // choice, SRS-ENG-041), so the item stays enabled for them.
      id: "ctx-reset-file",
      label: `Reset ${word} to`,
      icon: "reset",
      disabled: allHidden,
      hint: allHidden ? flaggedHint : undefined,
      children: [
        {
          id: "ctx-reset-index",
          label: "Index — discard unstaged changes…",
          hidden: staged,
        },
        {
          id: "ctx-reset-head",
          label: "HEAD — discard all changes…",
        },
      ],
    },
    // --- file (GE sepFile group) -------------------------------------------
    {
      id: "ctx-difftool",
      label: "Open with difftool",
      icon: "difftool",
      divider: true,
      disabled: !single,
      hint: single ? undefined : oneAtATime,
    },
    {
      id: "ctx-open-file",
      label: "Open",
      icon: "open",
      hidden: allDeleted,
      disabled: !single,
      hint: single ? undefined : oneAtATime,
    },
    {
      id: "ctx-open-with",
      label: "Open with…",
      icon: "openWith",
      hidden: allDeleted,
      disabled: !single,
      hint: single ? undefined : oneAtATime,
    },
    {
      id: "ctx-edit-file",
      label: "Edit",
      icon: "edit",
      hidden: allDeleted,
      disabled: !single,
      hint: single ? undefined : oneAtATime,
    },
    {
      id: "ctx-move-file",
      label: "Rename / move…",
      icon: "move",
      // GE: one tracked file. `git mv` refuses what git does not track.
      hidden: !anyTracked || allDeleted || allHidden,
      disabled: !single,
      hint: single ? undefined : oneAtATime,
    },
    {
      id: "ctx-delete-file",
      label: `Delete ${word}…`,
      icon: "delete",
      disabled: allDeleted,
      hint: allDeleted ? "Already deleted from the working tree." : undefined,
    },
    // --- browse (GE sepBrowse group) ---------------------------------------
    {
      id: "ctx-copy-path",
      label: single ? "Copy path" : "Copy paths",
      icon: "copy",
      divider: true,
      children: [
        { id: "ctx-copy-full", label: single ? "Full path" : "Full paths" },
        { id: "ctx-copy-relative", label: single ? "Relative path" : "Relative paths" },
      ],
    },
    {
      id: "ctx-show-in-folder",
      label: "Show in folder",
      icon: "folder",
      // The file manager is reached through the Tauri opener plugin; the
      // browser build has no such thing, so the item is not offered there.
      hidden: !shell,
      disabled: allDeleted,
      hint: allDeleted ? "Already deleted from the working tree." : undefined,
    },
    // --- ignore (GE sepIgnore group; work-tree rows only, as in GE) --------
    {
      id: "ctx-ignore-file",
      label: "Add to .gitignore…",
      icon: "ignore",
      divider: true,
      hidden: staged,
      disabled: !single,
      hint: single ? undefined : oneAtATime,
    },
    {
      id: "ctx-exclude-file",
      label: single ? "Add to .git/info/exclude…" : `Add ${n} files to .git/info/exclude…`,
      icon: "exclude",
      hidden: staged,
    },
    {
      id: "ctx-skip-worktree",
      label: "Skip worktree",
      icon: "skip",
      hidden: staged || !anyTracked,
      checked: files.some((f) => Boolean(f.skipWorktree)),
      disabled: anyConflict,
      hint: anyConflict ? "Resolve the conflict first." : undefined,
    },
    {
      id: "ctx-assume-unchanged",
      label: "Assume unchanged",
      icon: "assume",
      hidden: staged || !anyTracked,
      checked: files.some((f) => Boolean(f.assumeUnchanged)),
      disabled: anyConflict,
      hint: anyConflict ? "Resolve the conflict first." : undefined,
    },
    {
      id: "ctx-stop-tracking",
      label: "Stop tracking this file…",
      icon: "untrack",
      hidden: !anyTracked || anyDeleted,
      disabled: !single,
      hint: single ? undefined : oneAtATime,
    },
    // --- view (GE FileStatusList toolbar › Settings) -----------------------
    // GE keeps these two in the list's Settings drop-down. PowerGit has no
    // such toolbar in the commit dialog yet, and the menu is where the user
    // just made a file disappear, so the way back sits right here.
    {
      id: "ctx-show-skip-worktree",
      label: "Show skip-worktree files",
      icon: "show",
      divider: true,
      checked: view.skipWorktree,
    },
    {
      id: "ctx-show-assume-unchanged",
      label: "Show assumed-unchanged files",
      icon: "show",
      checked: view.assumeUnchanged,
    },
  ]
  return visible(nodes)
}

/** The engine reset scope behind a "Reset … to" child. */
export function resetScopeOf(id: string): "worktree" | "head" | null {
  return id === "ctx-reset-index" ? "worktree" : id === "ctx-reset-head" ? "head" : null
}

/** GE anchors exclude patterns to the file (`/dir/file`), so the line matches that path only. */
export function excludePattern(path: string): string {
  return `/${path.replace(/^\/+/, "")}`
}

/** The path on disk in the root's own separator style (the engine reports Windows roots with backslashes). */
export function fullPath(root: string | null | undefined, path: string): string {
  if (!root) return path
  const backslashes = root.includes("\\")
  const sep = backslashes ? "\\" : "/"
  const rel = backslashes ? path.replace(/\//g, "\\") : path
  return root.replace(/[\\/]+$/, "") + sep + rel
}

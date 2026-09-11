import type { RepoOperationState } from "../../engine"
import { shortcutLabel } from "../../hotkeys/catalog"

// The commit context menu as data (v0.15.0). Git Extensions builds its menu
// in RevisionGridControl; PowerGit builds the same list here, as a pure
// model, so the order, the visibility rules and the shortcuts are asserted
// by a unit test instead of by reading JSX. `RevisionContextMenu.tsx` only
// renders what this returns.

export type MenuIcon =
  | "checkout"
  | "merge"
  | "rebase"
  | "rebaseInteractive"
  | "reset"
  | "branch"
  | "tag"
  | "delete"
  | "cherryPick"
  | "revert"
  | "fixup"
  | "compare"
  | "copy"
  | "archive"
  | "browser"
  | "commit"
  | "difftool"
  | "manipulate"

export type MenuNode = {
  id: string
  label: string
  icon?: MenuIcon
  shortcut?: string
  disabled?: boolean
  hidden?: boolean
  /** A separator is drawn above this item (start of a group). */
  divider?: boolean
  /** Argument of the action: a branch or tag name, a reset mode, a copy field. */
  value?: string
  /** Why the item is disabled; shown as the item's title. */
  hint?: string
  /** A check item (GE's "Detect and follow renames"); undefined on an ordinary item. */
  checked?: boolean
  children?: MenuNode[]
}

/** The text a "Copy" child puts on the clipboard for one revision; `field` is the child's value. */
export function revisionCopyText(
  rev: { id: string; message: string; author: string; date: string },
  field: string | undefined,
): string {
  switch (field) {
    case "shortSha":
      return rev.id.slice(0, 7)
    case "message":
      return rev.message
    case "author":
      return rev.author
    case "date":
      return rev.date
    case "all":
      return `${rev.id}\n${rev.author}\n${rev.date}\n${rev.message}`
    default:
      return rev.id
  }
}

/** GE's CopyContextMenuItem: the "Copy" submenu of both grid menus. */
export function copySubmenu(sha: string): MenuNode {
  return {
    id: "ctx-copy",
    label: "Copy",
    icon: "copy",
    divider: true,
    children: [
      { id: "ctx-copy-sha", label: "SHA", value: "sha" },
      { id: "ctx-copy-short-sha", label: `Short SHA (${shorten(sha)})`, value: "shortSha" },
      { id: "ctx-copy-message", label: "Message", value: "message" },
      { id: "ctx-copy-author", label: "Author", value: "author" },
      { id: "ctx-copy-date", label: "Date", value: "date" },
      { id: "ctx-copy-all", label: "All of it", value: "all", divider: true },
    ],
  }
}

export type RevisionMenuInput = {
  sha: string
  subject: string
  /** Pending-change rows (v0.14.1) are not commits. */
  artificial: boolean
  /** Refs drawn on this row (HEAD, local branches, remote branches, tags). */
  refs: string[]
  currentBranch: string
  /** All local branch names, so a ref on the row can be told apart from a tag. */
  localBranches: string[]
  tags: string[]
  /** Staged files: "Create fixup/squash commit" needs something to commit. */
  stagedCount: number
  /** The row that was selected before the right-click, when it is another one. */
  otherSelectedSha: string | null
  /** The commit marked with "Select as BASE", if any. */
  baseSha: string | null
  /** Commit page on the remote's host, or null when we cannot map the remote. */
  webUrl: string | null
  /** A merge/rebase in progress blocks starting another one. */
  operation: RepoOperationState
}

const shorten = (sha: string) => sha.slice(0, 7)

/** Local branches drawn on this row (never HEAD, never a tag or remote). */
export function branchesOnRow(input: Pick<RevisionMenuInput, "refs" | "localBranches">): string[] {
  return input.refs.filter((r) => r !== "HEAD" && input.localBranches.includes(r))
}

/** Tags drawn on this row. */
export function tagsOnRow(input: Pick<RevisionMenuInput, "refs" | "tags">): string[] {
  return input.refs.filter((r) => input.tags.includes(r))
}

function visible(nodes: MenuNode[]): MenuNode[] {
  return nodes.filter((n) => !n.hidden)
}

export function buildRevisionMenu(input: RevisionMenuInput): MenuNode[] {
  if (input.artificial) {
    return [{ id: "ctx-open-commit", label: "Open commit dialog…", icon: "commit" }]
  }
  const branches = branchesOnRow(input)
  const tags = tagsOnRow(input)
  const mergeable = branches.filter((b) => b !== input.currentBranch)
  const busy = input.operation !== "none"
  const busyHint = "Finish the operation in progress first."
  const short = shorten(input.sha)

  const nodes: MenuNode[] = [
    {
      id: "ctx-checkout",
      label: "Checkout Branch…",
      icon: "checkout",
      shortcut: shortcutLabel("browse.checkoutBranch"),
      disabled: branches.length === 0,
    },
    {
      id: "ctx-merge",
      label: `Merge '${mergeable[0] ?? ""}' into current branch…`,
      icon: "merge",
      shortcut: shortcutLabel("browse.mergeBranch"),
      // GE only offers Merge on a row that carries a branch other than the
      // one checked out; merging a bare commit is not in its menu.
      hidden: mergeable.length === 0,
      disabled: busy,
      hint: busy ? busyHint : undefined,
      value: mergeable[0],
    },
    {
      id: "ctx-rebase",
      label: "Rebase Current Branch onto Here…",
      icon: "rebase",
      shortcut: shortcutLabel("browse.rebase"),
      disabled: busy,
      hint: busy ? busyHint : undefined,
    },
    {
      id: "ctx-rebase-interactive",
      label: "Rebase interactively from here…",
      icon: "rebaseInteractive",
      disabled: busy,
      hint: busy ? busyHint : undefined,
    },
    {
      id: "ctx-reset",
      label: "Reset Current Branch to Here…",
      icon: "reset",
      children: [
        { id: "ctx-reset-soft", label: "Soft — keep all changes staged", value: "soft" },
        { id: "ctx-reset-mixed", label: "Mixed — keep changes in working tree", value: "mixed" },
        { id: "ctx-reset-hard", label: "Hard — discard all working tree changes", value: "hard" },
      ],
    },

    {
      id: "ctx-create-branch",
      label: "Create Branch Here…",
      icon: "branch",
      shortcut: shortcutLabel("browse.createBranch"),
      divider: true,
    },
    {
      id: "ctx-create-tag",
      label: "Create Tag Here…",
      icon: "tag",
      shortcut: shortcutLabel("browse.createTag"),
    },
    {
      id: "ctx-delete-branch",
      label: "Delete Branch",
      icon: "delete",
      hidden: branches.length === 0,
      children: branches.map((b) => ({
        id: `ctx-delete-branch-${b}`,
        label: b,
        value: b,
        disabled: b === input.currentBranch,
        hint: b === input.currentBranch ? "The checked-out branch cannot be deleted." : undefined,
      })),
    },
    {
      id: "ctx-delete-tag",
      label: "Delete Tag",
      icon: "delete",
      hidden: tags.length === 0,
      children: tags.map((t) => ({ id: `ctx-delete-tag-${t}`, label: t, value: t })),
    },

    { id: "ctx-cherry-pick", label: "Cherry-pick Here…", icon: "cherryPick", divider: true },
    { id: "ctx-revert", label: "Revert Commit…", icon: "revert" },
    {
      id: "ctx-fixup",
      label: `Create fixup commit for ${short}…`,
      icon: "fixup",
      disabled: input.stagedCount === 0,
      hint: input.stagedCount === 0 ? "Stage the changes to fold in first." : undefined,
    },
    {
      id: "ctx-squash",
      label: `Create squash commit for ${short}…`,
      icon: "fixup",
      disabled: input.stagedCount === 0,
      hint: input.stagedCount === 0 ? "Stage the changes to fold in first." : undefined,
    },

    {
      id: "ctx-compare",
      label: "Compare",
      icon: "compare",
      divider: true,
      children: [
        { id: "ctx-compare-head", label: "…with HEAD" },
        { id: "ctx-compare-worktree", label: "…to working directory" },
        {
          id: "ctx-compare-selected",
          label: "…selected commits",
          disabled: input.otherSelectedSha === null,
          hint: input.otherSelectedSha === null ? "Select another commit in the grid first." : undefined,
        },
        { id: "ctx-compare-set-base", label: "Select as BASE to compare", divider: true },
        {
          id: "ctx-compare-to-base",
          label: input.baseSha ? `…to BASE ${shorten(input.baseSha)}` : "…to BASE",
          disabled: input.baseSha === null || input.baseSha === input.sha,
          hint: input.baseSha === null ? "Select a BASE commit first." : undefined,
        },
      ],
    },

    copySubmenu(input.sha),
    { id: "ctx-archive", label: "Create archive…", icon: "archive" },
    {
      id: "ctx-open-browser",
      label: "Open in browser",
      icon: "browser",
      disabled: input.webUrl === null,
      hint:
        input.webUrl === null ? "No remote on a host PowerGit knows (GitHub, GitLab, Bitbucket, Azure)." : undefined,
    },
  ]

  // Hidden items must not leave a group's divider on the item above them.
  const shown = visible(nodes).map((n) => (n.children ? { ...n, children: visible(n.children) } : n))
  return shown.map((n, i) => (i === 0 ? { ...n, divider: false } : n))
}

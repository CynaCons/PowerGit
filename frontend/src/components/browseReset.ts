import type { LineAction } from "../hooks/useDiffLineSelection"
import type { ResetScope } from "../engine"

// What "Reset" means in the Browse diff view (v0.15.5). Owner: "when I'm in
// the diff view, I should be able to right click on a file and hit reset…
// if it's in the diff of the working directory, it should just reset the
// staged or unstaged changes, basically resetting what the user is looking
// at. For commits that are already committed, then it's easy, you just reset
// what the user has selected and put that in the staged of the current
// working directory."
//
// The panel shows three different diffs, so the same menu item means three
// different git operations. Getting this wrong is destructive in a way the
// user cannot see: a Working directory row shows worktree-vs-index, so a
// reset to HEAD there would throw away staged work that row never displayed.
// The rules live here, as data, so they can be read and tested without a
// browser — and every confirmation says what SURVIVES, not just what goes.

/** Which of the three diffs the panel is showing. */
export type BrowseRow =
  | { kind: "worktree" }
  | { kind: "index" }
  /** A revision: `sha` is already abbreviated for display. */
  | { kind: "commit"; sha: string }

export type Confirmation = {
  title: string
  text: string
  confirmLabel: string
  destructive: boolean
}

/** Whole-file action: a scoped reset, or a reverse apply of the file's own diff. */
export type FilePlan = {
  label: string
  /** The engine reset scope, or null when the file is undone by reverse-applying its diff. */
  scope: ResetScope | null
  confirm: Confirmation
}

export type LinePlan = {
  label: string
  action: LineAction
  confirm: Confirmation
}

/** Every mutation in this read-only panel is confirmed; the dialog is where the
 *  three meanings of "reset" are spelled out. */
export function fileResetPlan(row: BrowseRow, path: string, untracked: boolean): FilePlan {
  if (row.kind === "commit") {
    return {
      label: "Undo this file's changes…",
      scope: null,
      confirm: {
        title: "Undo this file's changes",
        text: `Undo what ${row.sha} did to ${path}?\n\nThe change is reversed in the working tree and staged, ready to commit. History is not rewritten and ${row.sha} keeps its content.`,
        confirmLabel: "Undo",
        destructive: true,
      },
    }
  }
  if (untracked) {
    // Owner's choice for new files: "Delete the file, with a clearly
    // different confirmation." Git has no copy of an untracked file, so
    // there is nothing a reset could restore it from.
    return {
      label: "Reset unstaged changes…",
      scope: "worktree",
      confirm: {
        title: "Delete untracked file",
        text: `${path} is not tracked by git, so resetting it deletes it from disk.\n\nGit holds no copy of this file. It cannot be recovered.`,
        confirmLabel: "Delete file",
        destructive: true,
      },
    }
  }
  if (row.kind === "index") {
    return {
      label: "Reset staged changes…",
      scope: "index",
      confirm: {
        title: "Reset staged changes",
        text: `Unstage the changes in ${path}?\n\nThe file on disk is not touched — the changes move back to the Working directory row.`,
        confirmLabel: "Unstage",
        destructive: false,
      },
    }
  }
  return {
    label: "Reset unstaged changes…",
    scope: "worktree",
    confirm: {
      title: "Reset unstaged changes",
      text: `Discard the unstaged changes in ${path}?\n\nThe file goes back to the version in the index, so anything already staged is kept. This cannot be undone.`,
      confirmLabel: "Reset",
      destructive: true,
    },
  }
}

export function lineResetPlan(row: BrowseRow, path: string, count: number): LinePlan {
  const lines = count === 1 ? "line" : `${count} lines`
  const changes = count === 1 ? "the selected change" : `${count} selected changes`
  if (row.kind === "commit") {
    return {
      label: `Undo selected ${lines}…`,
      action: "undo",
      confirm: {
        title: "Undo selected lines",
        text: `Undo what ${row.sha} did to ${changes} in ${path}?\n\nThe change is reversed in the working tree and staged, ready to commit. History is not rewritten.`,
        confirmLabel: "Undo",
        destructive: true,
      },
    }
  }
  if (row.kind === "index") {
    return {
      label: `Reset selected ${lines}…`,
      action: "unstage",
      confirm: {
        title: "Reset selected lines",
        text: `Unstage ${changes} in ${path}?\n\nThe file on disk is not touched — those lines move back to the Working directory row.`,
        confirmLabel: "Unstage",
        destructive: false,
      },
    }
  }
  return {
    label: `Reset selected ${lines}…`,
    action: "reset",
    confirm: {
      title: "Reset selected lines",
      text: `Discard ${changes} in ${path}?\n\nAnything already staged for this file is kept. The working tree is rewritten; this cannot be undone.`,
      confirmLabel: "Reset",
      destructive: true,
    },
  }
}

/** Untracked files come back from the engine status as "U" (see GitHost.GetStatus). */
export function isUntracked(status: string | undefined): boolean {
  return status === "U"
}

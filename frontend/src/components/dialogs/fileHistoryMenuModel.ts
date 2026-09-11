import { copySubmenu, type MenuNode } from "./revisionMenuModel"

// The file history grid's context menu as data (v0.16.0 review, finding 2:
// the filtered grid used to open the full Browse menu, so an old commit
// offered Reset and Checkout there). Git Extensions' FormFileHistory has its
// own, smaller menu (FormFileHistory.Designer.cs, FileHistoryContextMenu):
// Copy to clipboard | Open with difftool, Difftool selected <-> local,
// Save as | Manipulate commit (Revert, Cherry pick) | Detect and follow
// renames, exact renames and copies only. Its Opening handler disables the
// commit-only items on the artificial rows and the local difftool on the
// working-tree row. Save as is not here yet: PowerGit has no save-a-blob
// route or dialog anywhere. `FileHistoryContextMenu.tsx` only renders what
// this returns.

export type FileHistoryMenuInput = {
  sha: string
  /** Pending-change rows (Working directory / Index) are not commits. */
  artificial: boolean
  /** The view's "Follow renames" option (GE FollowRenamesInFileHistory). */
  follow: boolean
  /** The view's "Exact renames only" option, meaningful when `follow` is on. */
  exact: boolean
}

export function buildFileHistoryMenu(input: FileHistoryMenuInput): MenuNode[] {
  const commitOnly = input.artificial ? "Not a commit: the row is the working tree." : undefined
  return [
    { ...copySubmenu(input.sha), divider: false, disabled: input.artificial, hint: commitOnly },
    {
      id: "fh-difftool",
      label: "Open with difftool",
      icon: "difftool",
      divider: true,
    },
    {
      id: "fh-difftool-local",
      label: "Difftool selected ↔ local",
      icon: "difftool",
      disabled: input.artificial,
      hint: input.artificial ? "The row is the local file already." : undefined,
    },
    {
      id: "fh-manipulate",
      label: "Manipulate commit",
      icon: "manipulate",
      divider: true,
      disabled: input.artificial,
      hint: commitOnly,
      children: [
        { id: "fh-revert", label: "Revert commit", icon: "revert" },
        { id: "fh-cherry-pick", label: "Cherry pick commit", icon: "cherryPick" },
      ],
    },
    { id: "fh-follow", label: "Detect and follow renames", divider: true, checked: input.follow },
    {
      id: "fh-follow-exact",
      label: "Detect and follow — exact renames and copies only",
      checked: input.exact,
      disabled: !input.follow,
      hint: input.follow ? undefined : "Turn on Detect and follow renames first.",
    },
  ]
}

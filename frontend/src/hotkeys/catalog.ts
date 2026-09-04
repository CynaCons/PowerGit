import { chord, formatChord, type Chord } from "./parse"

export type Scope = "browse" | "commit" | "stash" | "dialog"

export type CommandId =
  | "browse.commit"
  | "browse.openRepo"
  | "browse.openSettings"
  | "browse.createBranch"
  | "browse.createTag"
  | "browse.checkoutBranch"
  | "browse.rebase"
  | "browse.pull"
  | "browse.push"
  | "browse.quickFetch"
  | "browse.quickPull"
  | "browse.quickPush"
  | "browse.quickPullOrFetch"
  | "browse.stash"
  | "browse.stashPop"
  | "browse.toggleLeftPanel"
  | "browse.focusLeftPanel"
  | "browse.focusRevisionGrid"
  | "browse.focusCommitInfo"
  | "browse.focusDiff"
  | "browse.focusFileTree"
  | "browse.focusNextTab"
  | "browse.focusPrevTab"
  | "browse.refresh"
  | "browse.gitBash"
  | "diff.stageSelected"
  | "diff.unstageSelected"
  | "commit.refresh"

export type CommandDef = {
  id: CommandId
  /** Git Extensions Command enum name, for tests and the remapping UI. */
  ge: string
  scope: Scope
  chord: Chord | null
  available: boolean
}

export const CATALOG: CommandDef[] = [
  { id: "browse.commit", ge: "Commit", scope: "browse", chord: chord("Space", { ctrl: true }), available: true },
  { id: "browse.openRepo", ge: "OpenRepo", scope: "browse", chord: chord("O", { ctrl: true }), available: true },
  {
    id: "browse.openSettings",
    ge: "OpenSettings",
    scope: "browse",
    chord: chord(",", { ctrl: true }),
    available: true,
  },
  {
    id: "browse.createBranch",
    ge: "CreateBranch",
    scope: "browse",
    chord: chord("B", { ctrl: true }),
    available: true,
  },
  { id: "browse.createTag", ge: "CreateTag", scope: "browse", chord: chord("T", { ctrl: true }), available: true },
  {
    id: "browse.checkoutBranch",
    ge: "CheckoutBranch",
    scope: "browse",
    chord: chord(".", { ctrl: true }),
    available: true,
  },
  {
    id: "browse.rebase",
    ge: "Rebase",
    scope: "browse",
    chord: chord("E", { ctrl: true, shift: true }),
    available: true,
  },
  { id: "browse.pull", ge: "PullOrFetch", scope: "browse", chord: chord("ArrowDown", { ctrl: true }), available: true },
  { id: "browse.push", ge: "Push", scope: "browse", chord: chord("ArrowUp", { ctrl: true }), available: true },
  {
    id: "browse.quickFetch",
    ge: "QuickFetch",
    scope: "browse",
    chord: chord("ArrowDown", { ctrl: true, shift: true }),
    available: true,
  },
  {
    id: "browse.quickPull",
    ge: "QuickPull",
    scope: "browse",
    chord: chord("P", { ctrl: true, shift: true }),
    available: true,
  },
  {
    id: "browse.quickPush",
    ge: "QuickPush",
    scope: "browse",
    chord: chord("ArrowUp", { ctrl: true, shift: true }),
    available: true,
  },
  { id: "browse.quickPullOrFetch", ge: "QuickPullOrFetch", scope: "browse", chord: chord("F8"), available: true },
  {
    id: "browse.stash",
    ge: "Stash",
    scope: "browse",
    chord: chord("ArrowUp", { ctrl: true, alt: true }),
    available: true,
  },
  {
    id: "browse.stashPop",
    ge: "StashPop",
    scope: "browse",
    chord: chord("ArrowDown", { ctrl: true, alt: true }),
    available: true,
  },
  {
    id: "browse.toggleLeftPanel",
    ge: "ToggleLeftPanel",
    scope: "browse",
    chord: chord("C", { ctrl: true, alt: true }),
    available: true,
  },
  {
    id: "browse.focusLeftPanel",
    ge: "FocusLeftPanel",
    scope: "browse",
    chord: chord("0", { ctrl: true }),
    available: true,
  },
  {
    id: "browse.focusRevisionGrid",
    ge: "FocusRevisionGrid",
    scope: "browse",
    chord: chord("1", { ctrl: true }),
    available: true,
  },
  {
    id: "browse.focusCommitInfo",
    ge: "FocusCommitInfo",
    scope: "browse",
    chord: chord("2", { ctrl: true }),
    available: true,
  },
  { id: "browse.focusDiff", ge: "FocusDiff", scope: "browse", chord: chord("3", { ctrl: true }), available: true },
  {
    id: "browse.focusFileTree",
    ge: "FocusFileTree",
    scope: "browse",
    chord: chord("4", { ctrl: true }),
    available: true,
  },
  {
    id: "browse.focusNextTab",
    ge: "FocusNextTab",
    scope: "browse",
    chord: chord("Tab", { ctrl: true }),
    available: true,
  },
  {
    id: "browse.focusPrevTab",
    ge: "FocusPrevTab",
    scope: "browse",
    chord: chord("Tab", { ctrl: true, shift: true }),
    available: true,
  },
  // Menu accelerator, not HotkeySettings — GE refreshToolStripMenuItem.ShortcutKeys = F5.
  { id: "browse.refresh", ge: "Refresh", scope: "browse", chord: chord("F5"), available: true },
  { id: "browse.gitBash", ge: "GitBash", scope: "browse", chord: chord("G", { ctrl: true }), available: false },

  { id: "diff.stageSelected", ge: "StageSelectedFile", scope: "commit", chord: chord("S"), available: true },
  { id: "diff.unstageSelected", ge: "UnStageSelectedFile", scope: "commit", chord: chord("U"), available: true },
  { id: "commit.refresh", ge: "Refresh", scope: "commit", chord: chord("F5"), available: true },
]

export function commandsInScope(scope: Scope): CommandDef[] {
  return CATALOG.filter((c) => c.scope === scope)
}

export function shortcutLabel(id: CommandId): string {
  const def = CATALOG.find((c) => c.id === id && c.available && c.chord)
  if (!def?.chord) return ""
  return formatChord(def.chord)
}

import { chord, formatChord, type Chord } from "./parse"

/** `global` (v0.15.6): checked before the top layer in every phase, shell only. */
export type Scope = "browse" | "commit" | "stash" | "dialog" | "global"

export type RecoveryCommandId =
  | "recovery.step1"
  | "recovery.step2"
  | "recovery.step3"
  | "recovery.step4"
  | "recovery.step5"
  | "recovery.step6"
  | "recovery.step7"
  | "recovery.step8"
  | "recovery.step9"

export type CommandId =
  | RecoveryCommandId
  | "browse.commit"
  | "browse.openRepo"
  | "browse.openSettings"
  | "browse.createBranch"
  | "browse.createTag"
  | "browse.checkoutBranch"
  | "browse.rebase"
  | "browse.mergeBranch"
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
  | "browse.gitConsole"
  | "browse.appLog"
  | "browse.fileHistory"
  | "diff.stageSelected"
  | "diff.unstageSelected"
  | "commit.refresh"

export type CommandDef = {
  id: CommandId
  /** Git Extensions Command enum name, for tests and the remapping UI.
   *  Null for a command GE has no equivalent of (v0.15.1: the Git console). */
  ge: string | null
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
  // GE MergeBranches (v0.15.0).
  {
    id: "browse.mergeBranch",
    ge: "MergeBranches",
    scope: "browse",
    chord: chord("M", { ctrl: true }),
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
    // GE binds Ctrl+0, but PowerGit reserves Ctrl+0 for zoom reset
    // (v0.13.13); Ctrl+Alt+L sits beside Ctrl+Alt+C (toggle left panel).
    chord: chord("L", { ctrl: true, alt: true }),
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
  // v0.15.1: PowerGit's own. Ctrl+` is the docked-console chord every
  // browser and VS Code already use, and Git Extensions has no equivalent.
  { id: "browse.gitConsole", ge: null, scope: "browse", chord: chord("`", { ctrl: true }), available: true },
  // v0.15.3: the same panel on its app-log tab, for when the platform
  // inspector will not open (owner, Ubuntu).
  {
    id: "browse.appLog",
    ge: null,
    scope: "browse",
    chord: chord("`", { ctrl: true, shift: true }),
    available: true,
  },
  // v0.16.0: file history of the file selected in the Diff or File Tree
  // tab (GE RevisionDiffControl.ShowHistory is a bare H on the focused
  // file list; PowerGit binds the chord the owner asked for so it works
  // from the grid as well).
  {
    id: "browse.fileHistory",
    ge: "ShowHistory",
    scope: "browse",
    chord: chord("H", { ctrl: true, shift: true }),
    available: true,
  },

  { id: "diff.stageSelected", ge: "StageSelectedFile", scope: "commit", chord: chord("S"), available: true },
  { id: "diff.unstageSelected", ge: "UnStageSelectedFile", scope: "commit", chord: chord("U"), available: true },
  { id: "commit.refresh", ge: "Refresh", scope: "commit", chord: chord("F5"), available: true },

  // v0.15.6 (Ubuntu freeze taskforce): Ctrl+Shift+F1..F9 ask the shell to
  // run recovery step 1..9 (`recover` command) while the picture is frozen.
  // IPC is proven alive during the freeze, so a keypress still gets through
  // when nothing on screen does. Shell only; the browser ignores them.
  ...recoveryCommands(),
]

function recoveryCommands(): CommandDef[] {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
    id: `recovery.step${n}` as RecoveryCommandId,
    ge: null,
    scope: "global",
    chord: chord(`F${n}`, { ctrl: true, shift: true }),
    available: true,
  }))
}

/** The step number a recovery command stands for. */
export function recoveryStepOf(id: CommandId): number | null {
  const m = /^recovery\.step([1-9])$/.exec(id)
  return m ? Number(m[1]) : null
}

export function commandsInScope(scope: Scope): CommandDef[] {
  return CATALOG.filter((c) => c.scope === scope)
}

export function shortcutLabel(id: CommandId): string {
  const def = CATALOG.find((c) => c.id === id && c.available && c.chord)
  if (!def?.chord) return ""
  return formatChord(def.chord)
}

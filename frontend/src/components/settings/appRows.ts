import { DEFAULT_BEHAVIOUR, type Behaviour } from "../../theme/behaviour"

// The app rows' "changed" rule (v0.18.0): a row differs from the default
// when any of the keys it shows does. The five confirmations are one row,
// the two rebase defaults another, so each needs the keys it owns listed.

export type BehaviourSwitch = { key: keyof Behaviour; label: string; testid: string }

export const CONFIRM_SWITCHES: BehaviourSwitch[] = [
  { key: "confirmForcePush", label: "Force-pushing a branch", testid: "settings-confirm-force-push" },
  { key: "confirmDeleteBranch", label: "Deleting a branch or tag", testid: "settings-confirm-delete-branch" },
  { key: "confirmResetHard", label: "Resetting hard (discards changes)", testid: "settings-confirm-reset-hard" },
  {
    key: "confirmCheckoutDirty",
    label: "Checking out with uncommitted changes",
    testid: "settings-confirm-checkout-dirty",
  },
  { key: "confirmAbortOperation", label: "Aborting a merge or rebase", testid: "settings-confirm-abort-operation" },
]

export const REBASE_SWITCHES: BehaviourSwitch[] = [
  {
    key: "defaultRebaseAutostash",
    label: "Stash and restore local changes around a rebase",
    testid: "settings-default-rebase-autostash",
  },
  {
    key: "defaultRebaseAutosquash",
    label: "Fold fixup! and squash! commits during an interactive rebase",
    testid: "settings-default-rebase-autosquash",
  },
]

/** True when any of `keys` differs from DEFAULT_BEHAVIOUR. */
export function behaviourChanged(value: Behaviour, keys: readonly (keyof Behaviour)[]): boolean {
  return keys.some((k) => value[k] !== DEFAULT_BEHAVIOUR[k])
}

/** The patch that puts `keys` back to their defaults. */
export function behaviourDefaults(keys: readonly (keyof Behaviour)[]): Partial<Behaviour> {
  const patch: Partial<Behaviour> = {}
  for (const k of keys) Object.assign(patch, { [k]: DEFAULT_BEHAVIOUR[k] })
  return patch
}

export function intervalLabel(minutes: number): string {
  if (minutes === 0) return "Never"
  return minutes === 1 ? "Every minute" : `Every ${minutes} minutes`
}

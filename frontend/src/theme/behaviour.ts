import { useSyncExternalStore } from "react"

// Behaviour and confirmations (v0.15.0, owner: an enhanced settings menu).
// Which destructive actions ask first, how often the app fetches on its
// own, and what the merge and rebase dialogs start with. Persisted under
// `pg.behaviour`; same store pattern as graph/graphOptions.ts.
//
// Confirmations default to on: the app has always asked before deleting a
// branch or resetting hard, and a preference is only worth having if the
// user can turn it off knowingly.

/** How a merge treats a fast-forwardable branch (git's --ff-only / --ff / --no-ff). */
export type MergeFf = "only" | "allow" | "no"

export type Behaviour = {
  confirmForcePush: boolean
  confirmDeleteBranch: boolean
  confirmResetHard: boolean
  confirmCheckoutDirty: boolean
  confirmAbortOperation: boolean
  /** Minutes between background fetches; 0 is off. */
  autoFetchMinutes: number
  defaultMergeFf: MergeFf
  defaultMergeSquash: boolean
  defaultRebaseAutostash: boolean
  defaultRebaseAutosquash: boolean
}

export const BEHAVIOUR_KEY = "pg.behaviour"

export const DEFAULT_BEHAVIOUR: Behaviour = {
  confirmForcePush: true,
  confirmDeleteBranch: true,
  confirmResetHard: true,
  confirmCheckoutDirty: true,
  confirmAbortOperation: true,
  autoFetchMinutes: 0,
  defaultMergeFf: "allow",
  defaultMergeSquash: false,
  defaultRebaseAutostash: false,
  defaultRebaseAutosquash: false,
}

/** The intervals the settings dialog offers, in minutes (0 = off). */
export const AUTO_FETCH_CHOICES = [0, 1, 5, 15, 30] as const

export function parseBehaviour(raw: string | null): Behaviour {
  if (!raw) return DEFAULT_BEHAVIOUR
  try {
    const o = JSON.parse(raw) as Partial<Record<keyof Behaviour, unknown>>
    const bool = (key: keyof Behaviour): boolean => {
      const v = o[key]
      return typeof v === "boolean" ? v : (DEFAULT_BEHAVIOUR[key] as boolean)
    }
    const minutes = o.autoFetchMinutes
    return {
      confirmForcePush: bool("confirmForcePush"),
      confirmDeleteBranch: bool("confirmDeleteBranch"),
      confirmResetHard: bool("confirmResetHard"),
      confirmCheckoutDirty: bool("confirmCheckoutDirty"),
      confirmAbortOperation: bool("confirmAbortOperation"),
      autoFetchMinutes:
        typeof minutes === "number" && AUTO_FETCH_CHOICES.includes(minutes as (typeof AUTO_FETCH_CHOICES)[number])
          ? minutes
          : DEFAULT_BEHAVIOUR.autoFetchMinutes,
      defaultMergeFf:
        o.defaultMergeFf === "only" || o.defaultMergeFf === "no" || o.defaultMergeFf === "allow"
          ? o.defaultMergeFf
          : DEFAULT_BEHAVIOUR.defaultMergeFf,
      defaultMergeSquash: bool("defaultMergeSquash"),
      defaultRebaseAutostash: bool("defaultRebaseAutostash"),
      defaultRebaseAutosquash: bool("defaultRebaseAutosquash"),
    }
  } catch {
    return DEFAULT_BEHAVIOUR
  }
}

function readStored(): Behaviour {
  try {
    return parseBehaviour(window.localStorage.getItem(BEHAVIOUR_KEY))
  } catch {
    return DEFAULT_BEHAVIOUR
  }
}

let behaviour: Behaviour = typeof window === "undefined" ? DEFAULT_BEHAVIOUR : readStored()
const listeners = new Set<() => void>()

export function getBehaviour(): Behaviour {
  return behaviour
}

export function setBehaviour(patch: Partial<Behaviour>) {
  const next = { ...behaviour, ...patch }
  if ((Object.keys(next) as (keyof Behaviour)[]).every((k) => next[k] === behaviour[k])) return
  behaviour = next
  try {
    window.localStorage.setItem(BEHAVIOUR_KEY, JSON.stringify(next))
  } catch {
    // Storage refused (private mode, quota): the choice still applies here.
  }
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useBehaviour(): Behaviour {
  return useSyncExternalStore(subscribe, getBehaviour, () => DEFAULT_BEHAVIOUR)
}

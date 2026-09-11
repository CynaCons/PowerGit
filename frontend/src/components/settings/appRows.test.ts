import { describe, expect, it } from "vitest"
import { DEFAULT_BEHAVIOUR } from "../../theme/behaviour"
import { CONFIRM_SWITCHES, REBASE_SWITCHES, behaviourChanged, behaviourDefaults, intervalLabel } from "./appRows"

// The "changed" rule of the behaviour rows (v0.18.0): a row that groups
// several keys is changed when any of them left its default, and its
// Reset puts every one of them back.

const CONFIRM_KEYS = CONFIRM_SWITCHES.map((c) => c.key)
const REBASE_KEYS = REBASE_SWITCHES.map((c) => c.key)

describe("behaviourChanged", () => {
  it("is false at the defaults", () => {
    expect(behaviourChanged(DEFAULT_BEHAVIOUR, CONFIRM_KEYS)).toBe(false)
    expect(behaviourChanged(DEFAULT_BEHAVIOUR, REBASE_KEYS)).toBe(false)
  })

  it("flips when one key of the group differs, and only for that group", () => {
    const one = { ...DEFAULT_BEHAVIOUR, confirmDeleteBranch: false }
    expect(behaviourChanged(one, CONFIRM_KEYS)).toBe(true)
    expect(behaviourChanged(one, REBASE_KEYS)).toBe(false)
    const rebase = { ...DEFAULT_BEHAVIOUR, defaultRebaseAutosquash: true }
    expect(behaviourChanged(rebase, CONFIRM_KEYS)).toBe(false)
    expect(behaviourChanged(rebase, REBASE_KEYS)).toBe(true)
  })

  it("resets exactly the group's keys to their defaults", () => {
    const patch = behaviourDefaults(CONFIRM_KEYS)
    expect(Object.keys(patch).sort()).toEqual([...CONFIRM_KEYS].sort())
    for (const k of CONFIRM_KEYS) expect(patch[k]).toBe(true)
    expect(behaviourDefaults(REBASE_KEYS)).toEqual({ defaultRebaseAutostash: false, defaultRebaseAutosquash: false })
  })
})

describe("the switches", () => {
  it("keep the test ids the specs click", () => {
    expect(CONFIRM_SWITCHES.map((c) => c.testid)).toEqual([
      "settings-confirm-force-push",
      "settings-confirm-delete-branch",
      "settings-confirm-reset-hard",
      "settings-confirm-checkout-dirty",
      "settings-confirm-abort-operation",
    ])
    expect(REBASE_SWITCHES.map((c) => c.testid)).toEqual([
      "settings-default-rebase-autostash",
      "settings-default-rebase-autosquash",
    ])
  })

  it("labels the fetch intervals", () => {
    expect(intervalLabel(0)).toBe("Never")
    expect(intervalLabel(1)).toBe("Every minute")
    expect(intervalLabel(5)).toBe("Every 5 minutes")
  })
})

import { describe, expect, it } from "vitest"
import { AUTO_FETCH_CHOICES, DEFAULT_BEHAVIOUR, getBehaviour, parseBehaviour, setBehaviour } from "./behaviour"

describe("behaviour preferences (v0.15.0)", () => {
  it("defaults to asking before every destructive action, with auto-fetch off", () => {
    expect(DEFAULT_BEHAVIOUR.confirmForcePush).toBe(true)
    expect(DEFAULT_BEHAVIOUR.confirmDeleteBranch).toBe(true)
    expect(DEFAULT_BEHAVIOUR.confirmResetHard).toBe(true)
    expect(DEFAULT_BEHAVIOUR.confirmCheckoutDirty).toBe(true)
    expect(DEFAULT_BEHAVIOUR.confirmAbortOperation).toBe(true)
    expect(DEFAULT_BEHAVIOUR.autoFetchMinutes).toBe(0)
    expect(DEFAULT_BEHAVIOUR.defaultMergeFf).toBe("allow")
  })

  it("falls back to the defaults for missing, malformed or unknown values", () => {
    expect(parseBehaviour(null)).toEqual(DEFAULT_BEHAVIOUR)
    expect(parseBehaviour("{nope")).toEqual(DEFAULT_BEHAVIOUR)
    expect(parseBehaviour(JSON.stringify({ confirmResetHard: "no" }))).toEqual(DEFAULT_BEHAVIOUR)
    // An interval the dialog does not offer is not honoured.
    expect(parseBehaviour(JSON.stringify({ autoFetchMinutes: 7 })).autoFetchMinutes).toBe(0)
    expect(parseBehaviour(JSON.stringify({ defaultMergeFf: "sometimes" })).defaultMergeFf).toBe("allow")
  })

  it("keeps the values it understands", () => {
    const stored = parseBehaviour(
      JSON.stringify({ confirmDeleteBranch: false, autoFetchMinutes: 15, defaultMergeFf: "no" }),
    )
    expect(stored.confirmDeleteBranch).toBe(false)
    expect(stored.autoFetchMinutes).toBe(15)
    expect(stored.defaultMergeFf).toBe("no")
    expect(stored.confirmForcePush).toBe(true)
    expect(AUTO_FETCH_CHOICES).toContain(15)
  })

  it("updates the live value even where storage is unavailable", () => {
    setBehaviour({ confirmResetHard: false, autoFetchMinutes: 5 })
    expect(getBehaviour().confirmResetHard).toBe(false)
    expect(getBehaviour().autoFetchMinutes).toBe(5)
    // Untouched keys keep their value.
    expect(getBehaviour().confirmForcePush).toBe(true)
    setBehaviour(DEFAULT_BEHAVIOUR)
    expect(getBehaviour()).toEqual(DEFAULT_BEHAVIOUR)
  })
})

import { describe, expect, it } from "vitest"
import { SETTINGS_CATALOG, isShown, matchSettings, metaOf, sectionShown } from "./settingsCatalog"

// The search over the settings page (v0.18.0): every word must hit the
// title, the description or a keyword of a row, case-insensitively.

describe("matchSettings", () => {
  it("returns null for no query, so everything shows", () => {
    expect(matchSettings("")).toBeNull()
    expect(matchSettings("   ")).toBeNull()
    expect(isShown(null, "appearance.theme")).toBe(true)
    expect(sectionShown(null, "updates")).toBe(true)
  })

  it("finds a row by one word of its title, whatever the case", () => {
    const hits = matchSettings("FETCH")
    expect(hits).not.toBeNull()
    // The owner's example: typing "fetch" leaves the background fetch alone.
    expect([...hits!]).toEqual(["behaviour.autoFetch"])
  })

  it("needs every word to hit the same row", () => {
    expect(matchSettings("merge tool")?.has("tools.mergeTool")).toBe(true)
    expect(matchSettings("merge tool")?.has("behaviour.mergeFf")).toBe(false)
    expect(matchSettings("merge default")?.has("behaviour.mergeFf")).toBe(true)
    expect(matchSettings("merge default")?.has("tools.mergeTool")).toBe(false)
  })

  it("matches a keyword the title and description do not carry", () => {
    expect(matchSettings("force")?.has("behaviour.confirmations")).toBe(true)
    expect(matchSettings("crlf")?.has("git.autoCrlf")).toBe(true)
    expect(matchSettings("autostash")?.has("behaviour.rebaseDefaults")).toBe(true)
  })

  it("returns an empty set when nothing matches, which hides every section", () => {
    const none = matchSettings("zzzz-no-such-setting")
    expect(none?.size).toBe(0)
    for (const s of SETTINGS_CATALOG) expect(sectionShown(none, s.id)).toBe(false)
  })
})

describe("the catalog", () => {
  it("has unique ids of the form section.row and a title for each", () => {
    const seen = new Set<string>()
    for (const s of SETTINGS_CATALOG) {
      for (const r of s.rows) {
        expect(r.id.startsWith(`${s.id}.`)).toBe(true)
        expect(seen.has(r.id)).toBe(false)
        seen.add(r.id)
        expect(metaOf(r.id).title.length).toBeGreaterThan(0)
      }
    }
  })

  it("anchors the rows the contents column lists on their own", () => {
    expect(metaOf("behaviour.confirmations").anchor).toBe("Confirmations")
    expect(metaOf("behaviour.autoFetch").anchor).toBe("Background fetch")
    expect(metaOf("diagnostics.recovery").anchor).toBe("Recovery ladder")
    expect(() => metaOf("nope.nothing")).toThrow()
  })
})

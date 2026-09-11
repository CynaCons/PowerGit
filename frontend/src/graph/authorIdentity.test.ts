import { describe, expect, it } from "vitest"
import { authorIdentity, initials, paletteOf, type AuthorPalette } from "./authorIdentity"

const PALETTES: AuthorPalette[] = ["local", "remote", "tag", "stash", "head", "extra"]

describe("initials (v0.18.1)", () => {
  it("takes the first letters of the first and last word", () => {
    expect(initials("Constantin Chabirand")).toBe("CC")
    expect(initials("Mara Anne Lindqvist")).toBe("ML")
    expect(initials("jean-luc picard")).toBe("JP")
  })

  it("takes the first two letters of a single word", () => {
    expect(initials("Mara")).toBe("MA")
    expect(initials("t")).toBe("T")
  })

  it("handles an email, a [bot] name and nothing at all", () => {
    expect(initials("cynako@gmail.com")).toBe("CY")
    expect(initials("jean.luc@example.com")).toBe("JL")
    expect(initials("dependabot[bot]")).toBe("DE")
    expect(initials("GitHub Actions[bot]")).toBe("GA")
    expect(initials("")).toBe("?")
    expect(initials("   ")).toBe("?")
    expect(initials("[]")).toBe("?")
  })
})

describe("paletteOf", () => {
  it("is stable and lands on one of the six ref-badge pairs", () => {
    for (const name of ["Constantin Chabirand", "Mara Lindqvist", "", "t", "cynako@gmail.com"]) {
      const first = paletteOf(name)
      expect(PALETTES).toContain(first)
      expect(paletteOf(name)).toBe(first)
    }
  })

  it("spreads a handful of names over more than one pair", () => {
    const names = ["Constantin Chabirand", "Mara Lindqvist", "Tomasz Wierzba", "Ines Oyelaran", "t", "dependabot[bot]"]
    expect(new Set(names.map(paletteOf)).size).toBeGreaterThan(1)
  })
})

describe("authorIdentity", () => {
  it("memoises per name", () => {
    const a = authorIdentity("Mara Lindqvist")
    expect(a).toEqual({ initials: "ML", palette: paletteOf("Mara Lindqvist") })
    expect(authorIdentity("Mara Lindqvist")).toBe(a)
    expect(authorIdentity("Mara")).not.toBe(a)
  })
})

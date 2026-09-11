import { describe, expect, test } from "vitest"
import { parseAuthorDiscs } from "./authorDiscs"

describe("author discs setting (v0.18.1)", () => {
  test("is on unless stored as off", () => {
    expect(parseAuthorDiscs(null)).toBe(true)
    expect(parseAuthorDiscs("1")).toBe(true)
    expect(parseAuthorDiscs("true")).toBe(true)
    expect(parseAuthorDiscs("garbage")).toBe(true)
    expect(parseAuthorDiscs("0")).toBe(false)
    expect(parseAuthorDiscs("false")).toBe(false)
    expect(parseAuthorDiscs(" OFF ")).toBe(false)
  })
})

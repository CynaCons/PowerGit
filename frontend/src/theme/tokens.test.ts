import { describe, expect, test } from "vitest"
import { cssVariables, dark, light } from "./tokens"

function luminance(hex: string) {
  const rgb = hex
    .match(/[\da-f]{2}/gi)!
    .slice(0, 3)
    .map((x) => Number.parseInt(x, 16) / 255)
  return rgb.reduce(
    (sum, channel, i) =>
      sum +
      (i === 0 ? 0.2126 : i === 1 ? 0.7152 : 0.0722) *
        (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4),
    0,
  )
}

function contrast(foreground: string, background: string) {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

describe("semantic visual tokens", () => {
  test.each([
    ["light", light],
    ["dark", dark],
  ])("%s text and graphics meet contrast floors", (_name, t) => {
    expect(contrast(t.text, t.surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t.textSecondary, t.surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t.textMeta, t.surface)).toBeGreaterThanOrEqual(3)
    expect(contrast(t.primary, t.surface)).toBeGreaterThanOrEqual(3)
    // GE's canonical lane hues are retained for fixture parity; the pink
    // lane is 2.22:1 on white, so use a visible-graphic floor below WCAG's
    // text threshold while requiring the primary/focus graphics above.
    for (const lane of t.graph.lanes) expect(contrast(lane, t.surface)).toBeGreaterThanOrEqual(1.9)
  })

  test("CSS variables cover every runtime semantic family", () => {
    for (const t of [light, dark]) {
      const vars = cssVariables(t)
      expect(Object.keys(vars)).toEqual(
        expect.arrayContaining([
          "--pg-surface",
          "--pg-text",
          "--pg-diff-added",
          "--pg-diff-removed",
          "--pg-file-a",
          "--pg-file-m",
          "--pg-file-d",
          "--pg-file-r",
          "--pg-file-u",
          "--pg-file-other",
          "--pg-lane-1",
          "--pg-lane-7",
          "--pg-ref-local-bg",
          "--pg-ref-remote-fg",
        ]),
      )
      expect(Object.values(vars).every(Boolean)).toBe(true)
    }
  })
})

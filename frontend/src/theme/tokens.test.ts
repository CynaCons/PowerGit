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
    // The Git console is dark in both themes, so its own text is measured
    // against its own surfaces, never against the app's.
    expect(contrast(t.console.text, t.console.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t.console.text, t.console.lineBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t.console.meta, t.console.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t.console.meta, t.console.lineBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t.console.fail, t.console.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t.console.fail, t.console.lineBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t.console.ok, t.console.bg)).toBeGreaterThanOrEqual(4.5)
    // Review marks (v0.17.0) are graphics on the diff surface: the three
    // rings at 3:1, and the row text must stay readable over the cursor.
    expect(contrast(t.review.todo, t.surface)).toBeGreaterThanOrEqual(3)
    expect(contrast(t.review.todoStripe, t.surface)).toBeGreaterThanOrEqual(2)
    expect(contrast(t.review.ok, t.surface)).toBeGreaterThanOrEqual(3)
    expect(contrast(t.review.rejected, t.surface)).toBeGreaterThanOrEqual(3)
    expect(contrast(t.text, t.review.cursorBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t.diff.added, t.review.cursorBg)).toBeGreaterThanOrEqual(3)
    expect(contrast(t.diff.removed, t.review.cursorBg)).toBeGreaterThanOrEqual(3)
  })

  test.each([
    ["light", light],
    ["dark", dark],
  ])("%s review family: ok is the primary, rejected the removed red, the cursor the grid selection", (_name, t) => {
    expect(t.review.ok).toBe(t.primary)
    expect(t.review.rejected).toBe(t.diff.removed)
    expect(t.review.cursorBg).toBe(t.selectionBg)
    // Amber, not the added green: the unreviewed ring must not read as "+".
    expect(t.review.todo).not.toBe(t.diff.added)
    expect(t.review.todoStripe).not.toBe(t.diff.added)
    for (const value of Object.values(t.review)) expect(value).toMatch(/^(#[\da-f]{6}|rgba\(\d+, \d+, \d+, 0\.\d+\))$/i)
  })

  test("the review family is exported as --pg-review-* in both themes", () => {
    for (const t of [light, dark]) {
      const vars = cssVariables(t)
      expect(vars["--pg-review-todo"]).toBe(t.review.todo)
      expect(vars["--pg-review-todo-bg"]).toBe(t.review.todoBg)
      expect(vars["--pg-review-todo-stripe"]).toBe(t.review.todoStripe)
      expect(vars["--pg-review-ok"]).toBe(t.review.ok)
      expect(vars["--pg-review-ok-bg"]).toBe(t.review.okBg)
      expect(vars["--pg-review-rejected"]).toBe(t.review.rejected)
      expect(vars["--pg-review-rejected-bg"]).toBe(t.review.rejectedBg)
      expect(vars["--pg-review-cursor-bg"]).toBe(t.review.cursorBg)
    }
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
          "--pg-review-todo",
          "--pg-review-cursor-bg",
        ]),
      )
      expect(Object.values(vars).every(Boolean)).toBe(true)
    }
  })
})

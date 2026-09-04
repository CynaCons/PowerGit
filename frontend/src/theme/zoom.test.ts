import { describe, expect, test } from "vitest"
import { clampZoom, stepZoom, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEPS } from "./zoom"

describe("application zoom", () => {
  test("clamps invalid and out-of-range values", () => {
    expect(clampZoom(Number.NaN)).toBe(ZOOM_DEFAULT)
    expect(clampZoom(0)).toBe(ZOOM_MIN)
    expect(clampZoom(9)).toBe(ZOOM_MAX)
    expect(clampZoom(1.234)).toBe(1.23)
  })

  test("follows the familiar ladder and bounds", () => {
    expect(ZOOM_STEPS[ZOOM_STEPS.length - 1]).toBe(ZOOM_MAX)
    expect(stepZoom(1, 1)).toBe(1.1)
    expect(stepZoom(1, -1)).toBe(0.9)
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX)
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN)
  })
})

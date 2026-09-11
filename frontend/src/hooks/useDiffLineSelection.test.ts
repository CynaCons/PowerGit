import { describe, expect, it } from "vitest"
import { hasTextSelection, selectionAfterClick, type LineSelectionState } from "./useDiffLineSelection"

// Rows 0 and 1 are the hunk header side (not selectable), 2..6 the hunk body.
const selectable = new Set([2, 3, 4, 5, 6])
const none: LineSelectionState = { lineSel: new Set(), anchor: -1 }
const plain = { shiftKey: false, ctrlKey: false, metaKey: false }
const ctrl = { ...plain, ctrlKey: true }
const shift = { ...plain, shiftKey: true }
const sorted = (s: LineSelectionState | null) => [...(s?.lineSel ?? [])].sort((a, b) => a - b)

describe("selectionAfterClick (line selection, v0.13.14)", () => {
  it("a plain click selects that row alone and anchors there", () => {
    const after = selectionAfterClick({ lineSel: new Set([5]), anchor: 5 }, 3, selectable, plain, false)
    expect(sorted(after)).toEqual([3])
    expect(after?.anchor).toBe(3)
  })

  it("Ctrl+click toggles a row in and out", () => {
    const added = selectionAfterClick({ lineSel: new Set([3]), anchor: 3 }, 5, selectable, ctrl, false)
    expect(sorted(added)).toEqual([3, 5])
    const removed = selectionAfterClick(added!, 3, selectable, ctrl, false)
    expect(sorted(removed)).toEqual([5])
  })

  it("Shift+click ranges from the anchor over the selectable rows only", () => {
    const after = selectionAfterClick({ lineSel: new Set([2]), anchor: 2 }, 5, selectable, shift, false)
    expect(sorted(after)).toEqual([2, 3, 4, 5])
    expect(after?.anchor).toBe(2)
    // Without an anchor, Shift+click is a plain click.
    expect(sorted(selectionAfterClick(none, 4, selectable, shift, false))).toEqual([4])
  })

  it("Ctrl+Shift+click adds the range to what is selected", () => {
    const after = selectionAfterClick(
      { lineSel: new Set([6]), anchor: 2 },
      3,
      selectable,
      { ...shift, ctrlKey: true },
      false,
    )
    expect(sorted(after)).toEqual([2, 3, 6])
  })

  it("a click on a header row changes nothing", () => {
    expect(selectionAfterClick({ lineSel: new Set([3]), anchor: 3 }, 0, selectable, plain, false)).toBeNull()
  })
})

// Owner (v0.16.0): "The new reset lines in the diff view is amazing, but it's
// missing the ability to select text for copy-paste. Currently I can't select
// a few words in a line to copy paste." A mouse drag across the text ends in a
// click on the row where the button went up; that click must not pick the line.
describe("a drag that selected text does not toggle a line (v0.16.0)", () => {
  const state: LineSelectionState = { lineSel: new Set([3, 4]), anchor: 3 }

  it("a plain drag leaves the line selection alone", () => {
    expect(selectionAfterClick(state, 5, selectable, plain, true)).toBeNull()
    expect(selectionAfterClick(none, 5, selectable, plain, true)).toBeNull()
  })

  it("a Ctrl+drag and a Shift+drag leave it alone too", () => {
    expect(selectionAfterClick(state, 5, selectable, ctrl, true)).toBeNull()
    expect(selectionAfterClick(state, 5, selectable, shift, true)).toBeNull()
    // Including a drag that ends on a row that is already selected.
    expect(selectionAfterClick(state, 4, selectable, ctrl, true)).toBeNull()
  })

  it("the same click without a text selection is a line pick", () => {
    expect(sorted(selectionAfterClick(state, 5, selectable, plain, false))).toEqual([5])
  })
})

describe("hasTextSelection", () => {
  const doc = (sel: { isCollapsed: boolean; text: string } | null) => ({
    getSelection: () => (sel ? ({ isCollapsed: sel.isCollapsed, toString: () => sel.text } as Selection) : null),
  })

  it("is true only for a non-collapsed selection that holds text", () => {
    expect(hasTextSelection(doc({ isCollapsed: false, text: "brave new" }))).toBe(true)
    // The caret a click leaves behind.
    expect(hasTextSelection(doc({ isCollapsed: true, text: "" }))).toBe(false)
    // A range over nothing selectable (the gutter is user-select: none).
    expect(hasTextSelection(doc({ isCollapsed: false, text: "" }))).toBe(false)
    expect(hasTextSelection(doc(null))).toBe(false)
  })

  it("is false where there is no document at all (unit tests, SSR)", () => {
    expect(hasTextSelection(undefined)).toBe(false)
    expect(hasTextSelection()).toBe(false)
  })
})

import { useEffect, useRef, useState } from "react"
import { describeThrown, type DiffDto, type EngineClient, type RepoStatus } from "../engine"
import {
  buildPartialPatch,
  isChangeLine,
  partialEligibility,
  selectableIndices,
  type EligibilityContext,
  type PatchBase,
} from "../patch/partial"

export type LineMenuTarget = { x: number; y: number }
/**
 * What the selected lines are for. "undo" (v0.15.5) is the Browse panel's
 * action on a historical commit: the same reverse apply as "reset", but into
 * the index as well as the working tree, and 3-way so it survives the file
 * having moved on since that commit.
 */
export type LineAction = "stage" | "unstage" | "reset" | "undo"

/**
 * How each action reaches `git apply`. `base` is the side of the diff the
 * patch must describe, and it follows from one rule: a forward apply needs
 * the target to equal the patch's PREimage, a `--reverse` apply needs it to
 * equal the POSTimage.
 *
 *   stage    forward into the index, which is the diff's old side  -> "old"
 *   unstage  reverse against the index, which is the CACHED diff's
 *            new side                                              -> "new"
 *   reset    reverse against the working tree, the diff's new side -> "new"
 *   undo     reverse against the working tree at a commit's new side, into
 *            the index too and 3-way for drift                     -> "new"
 *
 * v0.15.5 fixed `unstage`, which built from "old". That patch's postimage
 * keeps the unselected "-" lines and drops the unselected "+" ones, so it
 * matches the index only when the selection covers a whole hunk; anything
 * narrower came back as git's "patch does not apply". Verified against real
 * git, and covered by partial.test.ts plus the Index-row case in
 * browse-reset.spec.ts — the commit dialog reaches the same table from the
 * same call, and its own spec only ever unstaged a whole hunk, which is why
 * this shipped in v0.13.14 and stayed.
 */
export const APPLY: Record<LineAction, { base: PatchBase; options: ApplyOptions }> = {
  stage: { base: "old", options: { cached: true } },
  unstage: { base: "new", options: { cached: true, reverse: true } },
  reset: { base: "new", options: { reverse: true } },
  undo: { base: "new", options: { reverse: true, index: true, threeWay: true } },
}

export type ApplyOptions = { cached?: boolean; reverse?: boolean; index?: boolean; threeWay?: boolean }

/** The modifier state of a row click, as `selectionAfterClick` reads it off the MouseEvent. */
export type ClickKeys = { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }
export type LineSelectionState = { lineSel: Set<number>; anchor: number }

/**
 * The line selection after a click on row `index`, or null when the click
 * changes nothing. Click selects the row, Ctrl+click toggles it, Shift+click
 * ranges from the anchor over the selectable rows (hunk bodies), and
 * Ctrl+Shift+click adds that range to what is already selected.
 *
 * `dragged` (v0.16.0, owner: "it's missing the ability to select text for
 * copy-paste"): the rows take plain mouse text selection again, and a
 * press-drag-release across the text ends in a click event on the row the
 * button went up on. That click is the end of the drag, not a line pick, and
 * the line selection stays as it was. The caller decides what a drag is
 * (DiffView: the pointer moved between press and release AND text is
 * selected); a click on already-selected text moves nothing and still picks
 * the line, even though Chromium dispatches the click before it collapses
 * that selection.
 */
export function selectionAfterClick(
  state: LineSelectionState,
  index: number,
  selectable: ReadonlySet<number>,
  keys: ClickKeys,
  dragged: boolean,
): LineSelectionState | null {
  if (dragged || !selectable.has(index)) return null
  const { lineSel, anchor } = state
  if (keys.shiftKey && anchor >= 0) {
    const [lo, hi] = [Math.min(anchor, index), Math.max(anchor, index)]
    const next = new Set(keys.ctrlKey || keys.metaKey ? lineSel : [])
    for (let i = lo; i <= hi; i++) if (selectable.has(i)) next.add(i)
    return { lineSel: next, anchor }
  }
  if (keys.ctrlKey || keys.metaKey) {
    const next = new Set(lineSel)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    return { lineSel: next, anchor: index }
  }
  return { lineSel: new Set([index]), anchor: index }
}

/** Whether the mouse has left a non-empty text selection in the document (false outside a browser). */
export function hasTextSelection(doc: Pick<Document, "getSelection"> | undefined = globalThis.document): boolean {
  const sel = doc?.getSelection()
  return sel !== null && sel !== undefined && !sel.isCollapsed && sel.toString().length > 0
}

// Line selection in the commit dialog's diff (v0.13.14). Owner: "in the
// commit view, we can select a piece of diff and reset it like we can in
// baseline Git Extensions." Click selects a row, Ctrl+click toggles,
// Shift+click ranges over selectable rows (hunk bodies); right-click on an
// unselected row selects it first. The selection is a set of indices into
// diff.text rows, which is what patch/partial.ts consumes.
export function useDiffLineSelection({
  engine,
  diff,
  context,
  onStatus,
  onError,
  onApplied,
}: {
  engine: EngineClient
  diff: DiffDto | null
  /** Reasons outside the text why no patch can be built (truncated, -w). */
  context?: EligibilityContext
  onStatus: (status: RepoStatus) => void
  onError: (message: string) => void
  /** Called after a successful apply so the caller reloads the diff. */
  onApplied: () => void
}) {
  const [lineSel, setLineSel] = useState<Set<number>>(new Set())
  const [menu, setMenu] = useState<LineMenuTarget | null>(null)
  const anchor = useRef(-1)

  // A new diff (other file, options, or a reload after an apply) starts with
  // nothing selected — but "new" means new CONTENT, not a new object.
  //
  // v0.15.5: the Browse panel's pending diff is re-fetched whenever the
  // status changes, and the status poll runs every ten seconds while the
  // window is visible. Keyed on the object, a selection made on a Working
  // directory row silently emptied itself a few seconds later. The selection
  // is a set of indices into `diff.text`, so it stays valid for exactly as
  // long as that text does.
  useEffect(() => {
    setLineSel(new Set())
    anchor.current = -1
  }, [diff?.path, diff?.text])

  const rows = diff ? diff.text.split("\n") : []
  const selectable = diff ? selectableIndices(diff.text) : new Set<number>()
  const selectedChanges = [...lineSel].filter((i) => isChangeLine(rows[i] ?? "")).length
  const eligibility = diff
    ? partialEligibility(diff.text, { truncated: diff.truncated, ...context })
    : ({ ok: false, reason: "no diff" } as const)

  /** `moved`: the pointer travelled between press and release (DiffView measures it). */
  function clickLine(index: number, e: React.MouseEvent, moved = false) {
    const dragged = moved && hasTextSelection()
    const next = selectionAfterClick({ lineSel, anchor: anchor.current }, index, selectable, e, dragged)
    if (!next) return
    setLineSel(next.lineSel)
    anchor.current = next.anchor
  }

  function openMenu(index: number, e: React.MouseEvent) {
    e.preventDefault()
    if (!lineSel.has(index) && selectable.has(index)) {
      setLineSel(new Set([index]))
      anchor.current = index
    }
    setMenu({ x: e.clientX, y: e.clientY })
  }

  /**
   * The selected rows as they appear, in file order, "+"/"-" markers kept:
   * the Browse diff's "Copy selected lines" menu item (v0.15.5). Plain
   * Ctrl+C over a mouse text selection is DiffView's copy handler, which
   * strips the markers (v0.16.0).
   */
  function selectedText(): string {
    return [...lineSel]
      .sort((a, b) => a - b)
      .map((i) => rows[i] ?? "")
      .join("\n")
  }

  /** The partial patch for the current selection, or null when no change line is selected. */
  function patchFor(mode: LineAction): string | null {
    if (!diff || !eligibility.ok) return null
    return buildPartialPatch(diff.text, lineSel, APPLY[mode].base)
  }

  /** True when the patch applied; false when nothing was selected or git refused. */
  async function apply(mode: LineAction): Promise<boolean> {
    const patch = patchFor(mode)
    if (!patch) return false
    try {
      onStatus(await engine.applyPatch(patch, APPLY[mode].options))
      setLineSel(new Set())
      onApplied()
      return true
    } catch (e) {
      onError(`${mode} lines failed: ${describeThrown(e)}`)
      return false
    }
  }

  return {
    lineSel,
    selectedChanges,
    selectedText,
    blocked: eligibility.ok ? null : eligibility.reason,
    clickLine,
    menu,
    openMenu,
    closeMenu: () => setMenu(null),
    patchFor,
    apply,
  }
}

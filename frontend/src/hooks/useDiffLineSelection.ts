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

  function clickLine(index: number, e: React.MouseEvent) {
    if (!selectable.has(index)) return
    if (e.shiftKey && anchor.current >= 0) {
      const [lo, hi] = [Math.min(anchor.current, index), Math.max(anchor.current, index)]
      const next = new Set(e.ctrlKey || e.metaKey ? lineSel : [])
      for (let i = lo; i <= hi; i++) if (selectable.has(i)) next.add(i)
      setLineSel(next)
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(lineSel)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      setLineSel(next)
      anchor.current = index
    } else {
      setLineSel(new Set([index]))
      anchor.current = index
    }
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
   * The selected rows as they appear, in file order, "+"/"-" markers kept.
   *
   * Line selection sets `user-select: none` on the rows (app.css
   * .diff-row-selectable), so dragging across the diff no longer selects its
   * text. Copying has to have another home, or enabling selection would take
   * a capability away (v0.15.5).
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

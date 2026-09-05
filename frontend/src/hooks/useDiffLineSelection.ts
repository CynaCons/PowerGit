import { useEffect, useRef, useState } from "react"
import { describeThrown, type DiffDto, type EngineClient, type RepoStatus } from "../engine"
import { buildPartialPatch, isChangeLine, partialEligibility, selectableIndices } from "../patch/partial"

export type LineMenuTarget = { x: number; y: number }
export type LineAction = "stage" | "unstage" | "reset"

// Line selection in the commit dialog's diff (v0.13.14). Owner: "in the
// commit view, we can select a piece of diff and reset it like we can in
// baseline Git Extensions." Click selects a row, Ctrl+click toggles,
// Shift+click ranges over selectable rows (hunk bodies); right-click on an
// unselected row selects it first. The selection is a set of indices into
// diff.text rows, which is what patch/partial.ts consumes.
export function useDiffLineSelection({
  engine,
  diff,
  onStatus,
  onError,
  onApplied,
}: {
  engine: EngineClient
  diff: DiffDto | null
  onStatus: (status: RepoStatus) => void
  onError: (message: string) => void
  /** Called after a successful apply so the caller reloads the diff. */
  onApplied: () => void
}) {
  const [lineSel, setLineSel] = useState<Set<number>>(new Set())
  const [menu, setMenu] = useState<LineMenuTarget | null>(null)
  const anchor = useRef(-1)

  // A new diff (other file, options, or a reload after an apply) starts with
  // nothing selected.
  useEffect(() => {
    setLineSel(new Set())
    anchor.current = -1
  }, [diff])

  const rows = diff ? diff.text.split("\n") : []
  const selectable = diff ? selectableIndices(diff.text) : new Set<number>()
  const selectedChanges = [...lineSel].filter((i) => isChangeLine(rows[i] ?? "")).length
  const eligibility = diff ? partialEligibility(diff.text) : ({ ok: false, reason: "no diff" } as const)

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

  /** The partial patch for the current selection, or null when no change line is selected. */
  function patchFor(mode: LineAction): string | null {
    if (!diff) return null
    return buildPartialPatch(diff.text, lineSel, mode === "reset" ? "new" : "old")
  }

  async function apply(mode: LineAction) {
    const patch = patchFor(mode)
    if (!patch) return
    try {
      onStatus(await engine.applyPatch(patch, { cached: mode !== "reset", reverse: mode !== "stage" }))
      setLineSel(new Set())
      onApplied()
    } catch (e) {
      onError(`${mode} lines failed: ${describeThrown(e)}`)
    }
  }

  return {
    lineSel,
    selectedChanges,
    blocked: eligibility.ok ? null : eligibility.reason,
    clickLine,
    menu,
    openMenu,
    closeMenu: () => setMenu(null),
    patchFor,
    apply,
  }
}

// The ref chips' model (v0.18.3, prototype docs/prototypes/branch-visibility.html
// tab 1 variant B). Owner: "All branches should be displayed. If there are
// too many, we need a way to either show a popup to view them all, or
// expand vertically the column. When my head is on a commit that has both
// local and remote branches, I shall see all these on the commit."
//
// Pure: no React, no DOM beyond an optional canvas for text measurement
// (with a fallback for tests and SSR). See docs/agents/memories/ref-chips.md.

export type RefKind = "head" | "stash" | "tag" | "remote" | "local"

export type RefContext = {
  /** The checked-out branch: first after HEAD, its remotes right behind it. */
  current?: string | null
  /** Tag names from the ref tree; a ref in the set is a tag. */
  tagSet: Set<string>
  /** Remote names from the ref tree; a ref whose first segment is one of
   *  them is a remote-tracking branch. Without it, any slash counts. */
  remoteNames?: string[]
}

/** Horizontal padding of a chip (6 px each side, app.css `.ref`). */
export const CHIP_PADDING = 12
/** An 11 px glyph and its 3 px gap. */
export const CHIP_GLYPH = 14
/** The gap between chips (`.msg-refs`). */
export const CHIP_GAP = 4
/** Room kept for the "+n" chip when anything is folded. */
export const MORE_CHIP = 26

export function kindOf(ref: string, ctx: RefContext): RefKind {
  if (ref === "HEAD") return "head"
  if (ctx.tagSet.has(ref)) return "tag"
  if (ref.includes("stash")) return "stash"
  return isRemote(ref, ctx.remoteNames) ? "remote" : "local"
}

export function isRemote(ref: string, remoteNames?: string[]): boolean {
  const slash = ref.indexOf("/")
  if (slash < 0) return false
  return !remoteNames || remoteNames.length === 0 || remoteNames.includes(ref.slice(0, slash))
}

/** The branch a remote-tracking ref mirrors: `origin/feature/x` → `feature/x`. */
function localNameOf(remote: string, remoteNames?: string[]): string {
  if (remoteNames) {
    for (const r of remoteNames) if (remote.startsWith(r + "/")) return remote.slice(r.length + 1)
  }
  return remote.slice(remote.indexOf("/") + 1)
}

/** Does a chip of this kind carry a glyph (fork, cloud or tag)? */
export function hasGlyph(kind: RefKind): boolean {
  return kind === "local" || kind === "remote" || kind === "tag"
}

/**
 * HEAD · the checked-out branch · its remotes (same name after the remote
 * prefix) · every other local branch, each followed by its own remotes · the
 * remotes with no local · tags · stashes. A branch and its remote counterpart
 * always sit together, so "both local and remote" reads at a glance.
 */
export function orderRefs(refs: string[], ctx: RefContext): string[] {
  const by = new Map<RefKind, string[]>()
  for (const ref of refs) {
    const kind = kindOf(ref, ctx)
    const list = by.get(kind)
    if (list) list.push(ref)
    else by.set(kind, [ref])
  }
  const current = ctx.current ?? null
  const locals = (by.get("local") ?? []).sort((a, b) => (a === current ? -1 : b === current ? 1 : a.localeCompare(b)))
  const remotes = (by.get("remote") ?? []).sort((a, b) => a.localeCompare(b))
  const tags = (by.get("tag") ?? []).sort((a, b) => a.localeCompare(b))
  const stashes = by.get("stash") ?? []
  const out: string[] = []
  if (by.has("head")) out.push("HEAD")
  const used = new Set<string>()
  for (const local of locals) {
    out.push(local)
    for (const remote of remotes) {
      if (!used.has(remote) && localNameOf(remote, ctx.remoteNames) === local) {
        out.push(remote)
        used.add(remote)
      }
    }
  }
  for (const remote of remotes) if (!used.has(remote)) out.push(remote)
  return out.concat(tags, stashes)
}

/**
 * As many chips as fit in `budgetPx`, in order, leaving room for the "+n"
 * chip whenever anything is hidden, and never fewer than one chip. `widthOf`
 * is the chip's own width; the gap between chips is added here.
 */
export function foldRefs(
  ordered: string[],
  budgetPx: number,
  widthOf: (ref: string) => number,
): { shown: string[]; hidden: string[] } {
  if (!Number.isFinite(budgetPx)) return { shown: ordered, hidden: [] }
  const shown: string[] = []
  let used = 0
  for (let i = 0; i < ordered.length; i++) {
    const w = widthOf(ordered[i]) + (i > 0 ? CHIP_GAP : 0)
    const last = i === ordered.length - 1
    const tail = last ? 0 : CHIP_GAP + MORE_CHIP
    if (used + w + tail > budgetPx && shown.length > 0) break
    used += w
    shown.push(ordered[i])
  }
  return { shown, hidden: ordered.slice(shown.length) }
}

// --- width measurement -------------------------------------------------------

/** The chip font (app.css `.ref`): 600 10px in the UI face. */
const CHIP_FONT_SIZE = 10
/** The fallback when there is no canvas (vitest, SSR): an average glyph. */
const FALLBACK_GLYPH_PX = 6.2

let measurer: CanvasRenderingContext2D | null | undefined
const textWidths = new Map<string, number>()

function measureContext(): CanvasRenderingContext2D | null {
  if (measurer !== undefined) return measurer
  measurer = null
  try {
    if (typeof document === "undefined") return null
    const ctx = document.createElement("canvas").getContext("2d")
    if (!ctx || typeof ctx.measureText !== "function") return null
    const face = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif"
    ctx.font = `600 ${CHIP_FONT_SIZE}px ${face}`
    measurer = ctx
  } catch {
    measurer = null
  }
  return measurer
}

/** Text width of a ref name in the chip font, measured once per name. */
export function textWidthOf(name: string): number {
  const cached = textWidths.get(name)
  if (cached !== undefined) return cached
  const ctx = measureContext()
  let width: number
  try {
    width = ctx ? ctx.measureText(name).width : NaN
  } catch {
    width = NaN
  }
  if (!Number.isFinite(width)) width = name.length * FALLBACK_GLYPH_PX
  textWidths.set(name, width)
  return width
}

/** A chip's width: the name, the padding and the glyph when it carries one. */
export function chipWidth(ref: string, kind: RefKind): number {
  return textWidthOf(ref) + CHIP_PADDING + (hasGlyph(kind) ? CHIP_GLYPH : 0)
}

/** Where a chip's click goes: the ref's tip in the ref tree, by the name the
 *  chip shows (branches, remote-tracking branches and tags; HEAD and stashes
 *  have no tip to jump to). */
export function findRefTarget(
  tree: {
    branches: { name: string; target: string }[]
    remotes: { name: string; target: string }[]
    tags: { name: string; target: string }[]
  } | null,
  name: string,
): string | null {
  if (!tree) return null
  for (const list of [tree.branches, tree.remotes, tree.tags]) {
    const hit = list.find((r) => r.name === name)
    if (hit) return hit.target
  }
  return null
}

/** Test seam: forget the measured widths (and the canvas). */
export function resetChipMeasurer(): void {
  measurer = undefined
  textWidths.clear()
}

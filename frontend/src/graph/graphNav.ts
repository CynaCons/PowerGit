import type { GraphRow } from "./types"

// Graph navigation (v0.18.12, owner: "control buttons for 'go to head', 'go
// to successor' and 'go to parent'"): the pure model behind the compass and
// the Ctrl+P / Ctrl+N / Ctrl+Shift+C / Alt+← / Alt+→ chords. Git Extensions
// is the reference (RevisionGridControl.goToParentToolStripMenuItem_Click,
// goToChildToolStripMenuItem_Click, ParentChildNavigationHistory,
// NavigationHistory): the first parent, the first child in the loaded graph,
// the way back remembered, a selection history walked with Alt+←/→.

/** Parent SHA → child SHAs, in row order (top of the grid first). */
export type ChildIndex = Map<string, string[]>

type RowIndex = { bySha: Map<string, GraphRow>; children: ChildIndex; head: string | null }

// One index per rows array, by reference: a refresh that changes nothing
// keeps the array (historyMerge.ts), so the index survives it; a page append
// is a new array and a new index. Built lazily on the first question.
const INDEX = new WeakMap<GraphRow[], RowIndex>()
let latest: { rows: GraphRow[]; index: RowIndex } | null = null

function addRows(idx: RowIndex, rows: GraphRow[], from: number): void {
  for (let i = from; i < rows.length; i++) {
    const row = rows[i]
    idx.bySha.set(row.rev.id, row)
    if (row.isHead && idx.head === null) idx.head = row.rev.id
    if (row.artificial) continue
    for (const p of row.rev.parents) {
      const list = idx.children.get(p)
      if (list) list.push(row.rev.id)
      else idx.children.set(p, [row.rev.id])
    }
  }
}

function indexOf(rows: GraphRow[]): RowIndex {
  let idx = INDEX.get(rows)
  if (idx) return idx
  const previous = latest?.rows
  const extendsPrevious = previous !== undefined && rows.length > previous.length &&
    rows[0] === previous[0] && rows[previous.length - 1] === previous[previous.length - 1]
  idx = extendsPrevious
    ? latest!.index
    : { bySha: new Map<string, GraphRow>(), children: new Map(), head: null }
  // Page appends preserve useHistory's prefix row identities, so only the
  // new engine rows extend these Maps; reloads rebuild them (v0.18.18).
  addRows(idx, rows, extendsPrevious ? previous.length : 0)
  INDEX.set(rows, idx)
  latest = { rows, index: idx }
  return idx
}

/** The loaded row for a SHA, or undefined when it is not in the grid. */
export function rowOf(rows: GraphRow[], sha: string): GraphRow | undefined {
  return indexOf(rows).bySha.get(sha)
}

/** The commit's parents in git order (the first parent first). A pending
 *  row or a SHA not loaded has none: there is nowhere to go from there. */
export function parentsOf(rows: GraphRow[], sha: string): string[] {
  const row = rowOf(rows, sha)
  return row && !row.artificial ? row.rev.parents : []
}

/** GE GetRevisionChildren(...)[0]: the first child in the loaded graph, in
 *  row order — the topmost row that lists the commit as a parent. Pending
 *  rows are skipped: they are not commits. Null when no loaded row has it
 *  as a parent (a tip, or its children are above the loaded window). */
export function firstChildOf(rows: GraphRow[], sha: string): string | null {
  return indexOf(rows).children.get(sha)?.[0] ?? null
}

/** The checked-out commit's SHA when its row is loaded, else null. */
export function headSha(rows: GraphRow[]): string | null {
  return indexOf(rows).head
}

/** The selection history (GE NavigationHistory): every selection is pushed,
 *  Alt+← walks back, Alt+→ forward; a new selection after a walk drops the
 *  forward entries. The same SHA twice in a row is one entry; the oldest
 *  entries fall off past the cap. */
export class NavHistory {
  private items: string[] = []
  private cursor = -1

  constructor(private readonly cap = 50) {}

  get current(): string | null {
    return this.cursor >= 0 ? this.items[this.cursor] : null
  }

  get canBack(): boolean {
    return this.cursor > 0
  }

  get canForward(): boolean {
    return this.cursor >= 0 && this.cursor < this.items.length - 1
  }

  /** Records a selection. A no-op when it is the current entry, so the
   *  selection a back/forward walk lands on is not pushed again. */
  push(sha: string): void {
    if (this.current === sha) return
    this.items = this.items.slice(0, this.cursor + 1)
    this.items.push(sha)
    if (this.items.length > this.cap) this.items = this.items.slice(this.items.length - this.cap)
    this.cursor = this.items.length - 1
  }

  back(): string | null {
    if (!this.canBack) return null
    this.cursor -= 1
    return this.items[this.cursor]
  }

  forward(): string | null {
    if (!this.canForward) return null
    this.cursor += 1
    return this.items[this.cursor]
  }

  clear(): void {
    this.items = []
    this.cursor = -1
  }
}

/** GE ParentChildNavigationHistory: the way back. "Go to parent" from M
 *  remembers M, so "go to child" from the parent returns to M whichever
 *  child the loaded graph lists first; "go to child" remembers the parent
 *  the same way. Any other selection change forgets both (settle()). */
export class ParentChildMemory {
  private childStack: string[] = []
  private parentStack: string[] = []
  /** The SHA a navigation is moving to; the next settle() with it keeps the stacks. */
  private expected: string | null = null
  /** The selection the stacks were last settled for. */
  private settled: string | null = null

  /** Where "go to child" returns to, if the last move was "go to parent" from there. */
  get previousChild(): string | null {
    return this.childStack.length > 0 ? this.childStack[this.childStack.length - 1] : null
  }

  /** Where "go to parent" returns to, if the last move was "go to child" from there. */
  get previousParent(): string | null {
    return this.parentStack.length > 0 ? this.parentStack[this.parentStack.length - 1] : null
  }

  /** The way back as seen from `sha`: the stacks when a move to it is under
   *  way, or when none is and they were settled for it; nothing for any
   *  other row (a render can ask before the selection effect has settled
   *  the change, and the row a move leaves keeps the graph's own answer
   *  while the target pages in). */
  wayBackFrom(sha: string): { child: string | null; parent: string | null } {
    const valid = this.expected !== null ? sha === this.expected : sha === this.settled
    if (!valid) return { child: null, parent: null }
    return { child: this.previousChild, parent: this.previousParent }
  }

  /** Moving from `from` down to `parent`: the way back is `from`. */
  toParent(from: string, parent: string): void {
    if (this.previousParent === parent) this.parentStack.pop()
    this.childStack.push(from)
    this.expected = parent
  }

  /** Moving from `from` up to `child`: the way back is `from`. */
  toChild(from: string, child: string): void {
    if (this.previousChild === child) this.childStack.pop()
    this.parentStack.push(from)
    this.expected = child
  }

  /** The selection changed to `sha`: our own move keeps the memory, any
   *  other change (a click, a key, a refresh) clears it, as GE does. */
  settle(sha: string | null): void {
    if (sha === null || sha !== this.expected) this.clear()
    this.expected = null
    this.settled = sha
  }

  clear(): void {
    this.childStack = []
    this.parentStack = []
    this.expected = null
    this.settled = null
  }
}

/** Why a compass button is disabled, or null when it can go somewhere. */
export type NavReason = "pending" | "none" | "no-parent" | "no-child" | "at-head" | "no-head"

export type NavTargets = {
  /** The selected commit, or null with a pending row / nothing selected. */
  sha: string | null
  /** The selected row is a pending (Working directory / Index) row. */
  pending: boolean
  /** The commit's parents, first parent first. */
  parents: string[]
  /** Where "go to parent" goes: the remembered way back, else the first parent. */
  parent: string | null
  /** Where "go to child" goes: the remembered way back, else the first loaded child. */
  child: string | null
  /** The checked-out commit when its row is loaded. */
  head: string | null
  atHead: boolean
  parentReason: NavReason | null
  childReason: NavReason | null
  headReason: NavReason | null
}

/** Everything the compass and the chords need for the selected row. */
export function navTargets(rows: GraphRow[], selected: GraphRow | undefined, memory?: ParentChildMemory): NavTargets {
  const head = headSha(rows)
  if (!selected) {
    return {
      sha: null,
      pending: false,
      parents: [],
      parent: null,
      child: null,
      head,
      atHead: false,
      parentReason: "none",
      childReason: "none",
      headReason: head ? null : "no-head",
    }
  }
  if (selected.artificial) {
    return {
      sha: null,
      pending: true,
      parents: [],
      parent: null,
      child: null,
      head,
      atHead: false,
      parentReason: "pending",
      childReason: "pending",
      headReason: head ? null : "no-head",
    }
  }
  const sha = selected.rev.id
  const parents = parentsOf(rows, sha)
  const back = memory?.wayBackFrom(sha)
  const parent = back?.parent ?? parents[0] ?? null
  const child = back?.child ?? firstChildOf(rows, sha)
  const atHead = head !== null && head === sha
  return {
    sha,
    pending: false,
    parents,
    parent,
    child,
    head,
    atHead,
    parentReason: parent ? null : "no-parent",
    childReason: child ? null : "no-child",
    headReason: head ? (atHead ? "at-head" : null) : "no-head",
  }
}

/** The tooltip line for a disabled button, in the interface's voice. */
export function reasonText(reason: NavReason): string {
  switch (reason) {
    case "pending":
    case "none":
      return "Select a commit to navigate"
    case "no-parent":
      return "No parent — first commit"
    case "no-child":
      return "No child in the loaded history"
    case "at-head":
      return "Already at HEAD"
    case "no-head":
      return "HEAD is not in the loaded history"
  }
}

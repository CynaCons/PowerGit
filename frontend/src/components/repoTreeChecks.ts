// The tree's checkboxes in the graph filter mode (v0.18.5, prototype tab 4
// variant A: `toggleRef`, `toggleGroup`, the tri-state groups). Pure so the
// rules are testable without the virtualised tree: names are full ref
// names; the checked-out branch counts as ticked and is never toggled.

export type CheckState = boolean | "some"

/** A group's box: ticked when every leaf below is, "some" when part of them. */
export function checkState(names: readonly string[], checked: ReadonlySet<string>, current: string | null): CheckState {
  if (names.length === 0) return false
  let on = 0
  for (const n of names) if (n === current || checked.has(n)) on++
  return on === names.length ? true : on > 0 ? "some" : false
}

/**
 * The ticks after a click on a leaf or a group: all on → all off, else all
 * on (the checked-out branch is skipped either way). Returns the same
 * array when nothing changes, so the store can skip the write.
 */
export function toggleNames(refs: readonly string[], names: readonly string[], current: string | null): string[] {
  const targets = names.filter((n) => n !== current)
  if (targets.length === 0) return [...refs]
  const set = new Set(refs)
  const allOn = targets.every((n) => set.has(n))
  if (allOn) for (const n of targets) set.delete(n)
  else for (const n of targets) set.add(n)
  return [...set]
}

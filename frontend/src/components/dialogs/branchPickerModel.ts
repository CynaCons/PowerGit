import type { RefTree } from "../../engine"

// The branch picker's model (v0.18.11), pure so it can be unit-tested: the
// items a ref tree offers (local branches minus the excluded ones, then the
// remote-tracking branches minus `origin/HEAD`), the substring filter, and
// the cursor's landing on the current value.

export type PickerKind = "local" | "remote"

export type PickerItem = { name: string; kind: PickerKind; target: string }

/** Branches first, in the tree's order, then remotes; `exclude` drops the checked-out branch. */
export function pickerItems(
  refs: Pick<RefTree, "branches" | "remotes"> | null,
  exclude: readonly string[] = [],
  kinds: readonly PickerKind[] = ["local", "remote"],
): PickerItem[] {
  const out: PickerItem[] = []
  if (kinds.includes("local"))
    for (const b of refs?.branches ?? [])
      if (!exclude.includes(b.name)) out.push({ name: b.name, kind: "local", target: b.target })
  if (kinds.includes("remote"))
    for (const r of refs?.remotes ?? [])
      if (!r.name.endsWith("/HEAD")) out.push({ name: r.name, kind: "remote", target: r.target })
  return out
}

/** Case-insensitive substring match on the name; an empty query keeps everything. */
export function filterItems(items: readonly PickerItem[], query: string): PickerItem[] {
  const q = query.trim().toLowerCase()
  return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : [...items]
}

/** Where the cursor starts when the list opens: on the value, else the first row. */
export function cursorFor(items: readonly PickerItem[], value: string): number {
  const at = items.findIndex((i) => i.name === value)
  return at >= 0 ? at : 0
}

/** The next cursor for ↑ / ↓, wrapping. */
export function stepCursor(cursor: number, count: number, delta: 1 | -1): number {
  if (count <= 0) return 0
  return (cursor + delta + count) % count
}

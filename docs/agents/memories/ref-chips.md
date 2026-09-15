# Ref chips (v0.18.3)

Owner (2026-09-15): "All branches should be displayed. If there are too
many, we need a way to either show a popup to view them all, or expand
vertically the column. When I click on a commit and view the Commit summary
in the bottom panel, I should see the active branches / tags on this commit,
with the icon to differentiate the local and remote. When my head is on a
commit that has both local and remote branches, I shall see all these on the
commit." Picks on `docs/prototypes/branch-visibility.html`: tab 1 variant B
(the row grows), tab 2 variant A (chips under the subject). Spec:
`frontend/tests/e2e/ref-chips.spec.ts`; model tests
`frontend/src/components/refChipsModel.test.ts`.

## The budget rule: fold by width, not by count
`components/refChipsModel.ts foldRefs(ordered, budgetPx, widthOf)` shows as
many chips as fit, in order, keeping `CHIP_GAP + MORE_CHIP` (4 + 26 px) for
the "+n" chip whenever anything is hidden, and never fewer than one chip.
The old rule was "three chips, then +n, and clip the group at 46 % of the
column", which lost the HEAD row's remote and tag on a wide window and
still overflowed on a narrow one. Width is the honest measure: three short
names fit where one `origin/feature/long-name` does not. `budget` of
`Infinity`/`undefined` folds nothing (the Commit tab).

## Where the width comes from
`RevisionGrid` computes it (`gridGeometry.ts chipBudget`): 60 % of
`bodyWidth − graph width − author − date − sha`, i.e. of the message column
after the four sized columns; the message text keeps the other 40 % and its
ellipsis (`.msg-text { min-width: 0 }`). `bodyWidth` is the grid body's
ResizeObserver width the graph cap already tracks; until it is measured the
budget is `undefined` and nothing folds (one frame). The file history's grid
is the same `RevisionGrid`, so it gets the budget for free. A chip's width
is `textWidthOf(name)` (a cached canvas `measureText` in `600 10px` + the
body's font family, the chip font of `app.css .ref`) + 12 px padding + 14 px
when the chip carries a glyph; without a canvas (vitest, SSR) the fallback
is `name.length × 6.2`. Change `.ref`'s padding, font or glyph size and
update `CHIP_PADDING` / `CHIP_GLYPH` / `CHIP_FONT_SIZE` with it.

## The pairing order
`orderRefs`: HEAD · the checked-out branch · its remotes (same name after
the remote prefix, `origin/feature/x` pairs with `feature/x`) · every other
local branch (sorted) each followed by its own remotes · the remotes with no
local · tags · stashes. So "both local and remote" always reads as two
adjacent chips, and what folds first is the least useful. The checked-out
branch reaches the grid as `currentBranch` (`repo.branch` from the session
view) through `HistoryPane`; the Commit tab reads `status.branch`.

## Glyphs and test ids
Every kind carries a glyph now: fork (`CallSplit`) on a local branch, cloud
on a remote, tag on a tag, all with class `ref-cloud` (the sizing class,
historical name). Kept for the older specs: `data-ref-kind`, `data-ref`,
the `.ref.<kind>` classes. New: `data-testid="ref-more"` (the "+n" chip,
`title` = the folded names), `data-testid="ref-fold"` (the "−" chip of an
expanded row), the group's `title` = every ref comma-separated,
`data-testid="commit-refs"` (the Commit tab's Refs row, absent when the
commit has no ref; pending rows never reach `CommitDetailView`).

## The expanded row: the geometry contract with draw.ts
One row at a time, SHA-keyed (`RevisionGrid` `expandedSha`); +n expands
(the click also selects), −, +n elsewhere or Escape with the grid focused
folds. The row is `.grid-row.expanded { height: auto }`, its `.msg` a
column (chips wrapping with `row-gap: 3px`, then the text at
`line-height: 18px` so the height stays an integer). The virtualizer
measures it: `ref={virtualizer.measureElement}` + `data-index` on every
row, `estimateSize` still `ROW_HEIGHT`, and `getItemKey` = the SHA so the
size cache follows the commit through a `--date-order` refresh
(`measureElement` uses `offsetHeight` / the ResizeObserver border box, both
local px under the `#root` zoom). `graph/draw.ts drawRows` no longer takes
`start, end, rowHeight`: it takes a `GridGeometry` — the canvas `top` (the
first visible item's start), its `height` (the visible sizes summed) and
`bands` `{index, start, size}` for the visible items plus one neighbour on
each side (`gridGeometry.ts`). Per row: `y = start − top`, the node at
`y + size / 2`, the selection and hover bands `size` tall, and the lane to
the previous / next row spans the real centre-to-centre distance
(`(prevSize + size) / 2`); each perpendicular stub is a sixth of its own
row's height and each bezier takes the distance it spans as its cell
height (GE's `rowHeight`). At 28 px everywhere every number equals the old
`(i − start) × 28`, so the layout model, `layout.ts` and the GE-parity
fixtures are untouched. Folding a row that is scrolled out of the overscan
calls `virtualizer.resizeItem(index, ROW_HEIGHT)` for it: with no element
to re-measure, its stale size would leave a phantom gap.

## What the spec samples
The lanes are on the canvas under the DOM row, so the expanded row's graph
is proven by pixels (the `selected-row-graph.spec.ts` helper): ink in the
top 15 % (the lane enters), the middle 40–60 % (the node sits at the middle)
and the bottom 15 % (the lane leaves) of the taller row, then 28 px again
after −. The fixture puts the eight-ref commit between two others so a lane
runs through it.

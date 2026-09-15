# Wrap lines in the code views (v0.18.8)

Owner (2026-09-15): "whenever we display code (e.g. Commit view or Diff
view): can we have an option to activate line wrapping in the floating
action menu?" Spec: `frontend/tests/e2e/wrap-lines.spec.ts`; store test
`frontend/src/components/codeWrap.test.ts`.

## One store, every pill
`components/codeWrap.ts` is a `useSyncExternalStore` store like
`graph/graphOptions.ts`: `getCodeWrap` / `setCodeWrap` / `useCodeWrap`,
persisted under `pg.diffWrap` (`"1"` / `"0"`, `parseCodeWrap` also takes
`"true"`; anything else is off). Default off: no-wrap with a horizontal
scroll and a sticky gutter is what Git Extensions shows, and
`diff-view.spec.ts` ("does not wrap") asserts that default. The "Wrap
lines" `ToggleButton` (`data-testid="diff-wrap-toggle"`, `aria-pressed`)
sits after Ignore whitespace in `DiffOptionsBar`, so the Diff tab, the
commit window and the file history get it through the one component;
`BlobPane` mounts `<DiffOptionsBar wrapOnly />` (the Tune icon and that
toggle alone) bottom-centre of its pane, which is `position: relative` for
it. Toggling in any pill changes every view at once.

## Not a DiffOptions field, on purpose
Wrapping is presentation. `DiffOptions` (context, whitespace, full file) is
the commit cache key and the engine query string; putting wrap there would
re-request the diff and evict the cache for a CSS change. The spec counts
`/diff` and `/changes` requests across the toggle and expects none.

## The `data-wrap` attribute drives app.css
The scroll container carries `data-wrap="true"` while the store is on:
DiffView's `diff-lines` Box (plain path), VirtualLines' scroll container
(virtual path, through its `wrap` prop), the blob pane's `<pre>` and the
Shiki `<div>`. `app.css` under `[data-wrap="true"]`: `.diff-row` is
`width: 100%` instead of `max-content`; `.diff-row-text` is
`white-space: pre-wrap; overflow-wrap: anywhere; min-width: 0` (anywhere,
not break-word: a 400-character token has to break too); the gutter keeps
`flex-shrink: 0` and its sticky left, so the numbers do not move. The blob
pane's own `<pre>` has `white-space: pre` from an emotion class (0,1,0), so
its rule is `[data-testid="blob-pane"][data-wrap="true"]` (0,2,0); Shiki's
nested `pre` / `code` only need `[data-wrap="true"] pre, … code` over the
UA default. No colours are touched by the attribute, so the WebKitGTK
"explicit colour on a toggled class" rule (webkitgtk-css.md) does not
apply; the row heights are what changes.

## VirtualLines measures wrapped rows the way the grid measures its expanded row
`VirtualLines` keeps `estimateSize` at `CODE_LINE_HEIGHT` (18) and, with
`wrap`, gives every row `ref={virtualizer.measureElement}` (the
`data-index` it already had is what `measureElement` reads), `height:
auto`, `white-space: pre-wrap`, `overflow-wrap: anywhere`, `width: 100%`,
and drops the track's `width: max-content`. `getItemKey` is the index (the
rows of one diff never move; the grid keys by SHA because its rows do).
Toggling calls `virtualizer.measure()` once (a ref remembers which value
was measured, so mount does not) to drop the cached heights: on, the rows
are measured again; off, they fall back to the estimate. Keyboard
scrolling amounts stay `CODE_LINE_HEIGHT`. `scrollToIndex` (review cursor,
go-to-line) lands on the row because @tanstack/virtual-core 3.17 reconciles
the scroll after the dynamic measurements settle
(`scheduleScrollReconcile`); DiffView's `scrollRowIntoView` still follows
with the vertical-only nudge. Line selection, Ctrl+C (`plainTextOf`) and
the review marks read the row elements, not their heights, so they are
untouched — `review-mode.spec`, `diff-text-selection.spec` and the wrap
spec's virtualized case (End, then k / Space / n / x on a 300-line diff)
are the proof.

## The diff's last parsed row is empty
The engine passes git's stdout through with its trailing newline, so
`parseGutterLines(diff.text)` ends with an empty "other" row and the review
layer's End (`moveTo(rowKeys.length - 1)`) lands on that row, one below the
last code line. Pre-existing, not changed in v0.18.8; the wrap spec steps
up with k before marking. Worth folding into the parser when the review
work touches it next.

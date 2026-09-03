# Grid diff and revision selection

## Ligatures stay disabled globally for code-like text
`frontend/src/theme.ts` exports `MONO_FONT` and `codeSx`, while `MuiCssBaseline`
falls back to `body { font-variant-ligatures: none; }` so the Fira Code-backed
monospace surfaces keep raw characters even when `sx`-generated classes cannot
be matched directly.

## Selected revision rows use a stronger shared highlight
`frontend/src/components/RevisionGrid.tsx` and `frontend/src/graph/draw.ts`
now share `--pg-grid-sel`, `--pg-grid-author`, and
`--pg-grid-sel-border` so the selected row has a stronger primary tint and a
2px left border, while same-author rows stay on the lighter tint.

## Auto-scroll must key off the SHA, not the `selected` index (v0.12.2)
`RevisionGrid.tsx`'s scroll-into-view effect used to depend only on
`[selected]` (a numeric index), so any refresh that reordered `rows` (e.g. a
`--date-order` tie-break) but kept the same commit selected still yanked the
viewport back to that index. Fixed by tracking
`lastScrolledSha = useRef<string | null>(null)`, comparing
`rows[selected]?.rev.id` against it, and only calling
`virtualizer.scrollToIndex` when the SHA actually changed AND the target row
isn't already fully visible (computed from `selected * ROW_HEIGHT` since
`estimateSize` is a constant, not measured, so pixel math is exact). Effect
deps are now `[selected, rows]` - needed so a same-index-different-SHA swap
(the opposite failure mode) still scrolls.

## `commit-info`'s innerText can flake on rapid key navigation
Rapidly pressing End/Home/PageUp/PageDown in one Playwright test made
`BottomPanel.tsx`'s `data-testid="commit-info"` panel's `.innerText()`
collapse all paragraph/line breaks (same words, no newlines) on some but not
all reads - a Chromium `innerText` layout-timing quirk, not a data bug (the
subject/SHA content was always correct). Don't assert exact multi-line
`toHaveText()` equality against a previously-captured `innerText()` snapshot
after several fast key presses; a `data-index` attribute check (synchronous,
driven by RevisionGrid's own props) or a `.not.toHaveText()` inequality
check is robust where an exact positive re-match is not.

# Recent repositories picker (v0.18.9, 2026-09-16)

## Centred and sized to the window, not anchored like a palette
Owner (2026-09-16): "the scale and size of the overlay is not good. Should
be centered, and larger so that we can actually read the stuff on the
cards." The v0.18.7 picker kept prototype C's command-palette geometry
(760 px, pinned 80 px from the top): on the owner's screen the tiles were
~250 px and every name of any length ended in "…". Rule now
(`RecentsDialog.tsx`): let MUI centre the paper (no `position`/`top`/`m`),
`width: min(1120px, calc((100vw - 96px) / zoom))`, `maxHeight: min(720px,
calc((100vh - 96px) / zoom))`. The theme zooms the dialog paper itself
(theme/index.ts), so viewport lengths on it divide by `useZoom()` to stay
in visual px — same pattern as `commitPaperSx`. Note min(1120, 100vw − 96)
is 1120 down to 1216 px of window; only below that does the window rule.

## The grid is auto-fill; the keys read the column count from the CSS
`gridTemplateColumns: repeat(auto-fill, minmax(340px, 1fr))` (three across
at 1120, two at 1004). `columnsOf()` splits `getComputedStyle(grid)
.gridTemplateColumns` — the browser resolves auto-fill to explicit px
tracks, so ArrowDown moves by one visual row without a media query
(recents.spec asserts it). Tile sizes (`RecentTile.tsx`): 96 px min, 16 px
sides, 36 px disc / 13 px initials, name 14 px / 500 with `minWidth: 12ch`,
branch chip `.ref` one size up (11 px, glyph 12) with `flexShrink: 100` so
it gives way before the name, path 12 px mono. A 20-character name shows
whole in a 340 px tile.

## Author and Date cells: 8 px in, like their headers (v0.18.9)
Owner: "the author col has the author icons truncated on the left — move
the col left boundary by a few pixels to ensure we don't cut our author
icons." `.author, .date, .sha` are `overflow: hidden` with no left
padding while `.grid-header > div` has 8 px, so the 18 px disc sat on the
cell's edge and the selected author's 3.5 px ring (v0.18.1) was clipped.
Rule (`app.css`): `.author, .date { padding-left: 8px }` — cells line up
under their headers and the ring has room; `DEFAULT_WIDTHS.author` 154 →
162 (`--col-a` fallbacks 162 / 136 under 1200 px) so a 20-character name
still fits. The SHA cell is right-aligned and untouched. author-identity
.spec asserts disc.x − cell.x ≥ 8 and the column at 162 px.

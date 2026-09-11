# DiffView in review mode (v0.17.0)

Captured 2026-09-11 by the VIEW worker. Design: docs/design/review-mode.md.

## The `review` prop must leave the non-review DOM and CSS byte-identical
`DiffView.test.ts` asserts no review DOM without the prop. The stronger
check used while building it: `renderToStaticMarkup` of the plain, virtual,
selected and unselected variants before and after, `cmp`'d — the emotion
class hash of the `diff-lines` Box is part of that, so its non-review `sx`
must stay the same object (`PLAIN_LINES_SX`); a spread with one extra key
changes the hash and the CSS.

## The mark cell lives in the gutter on purpose
`.diff-row-mark` is appended inside `.diff-row-gutter`, so it inherits
`user-select: none` and `plainTextOf` (Ctrl+C) never sees it. Its click
calls `stopPropagation`, so the row's `onLineClick` (line selection for
reset) does not fire; a click on the text runs `onLineClick` and then
`onCursor`. Do not move the mark into `.diff-row-text`.

## Keys: the host runs at window capture, VirtualLines is gated anyway
`HotkeyHost` listens on `window` in the capture phase and calls
`stopPropagation` when a layer handles the key, so React's bubble-phase
`onKeyDown` in `VirtualLines` never sees a handled Arrow/Home/End.
`VirtualLines` still takes `passKeys` (true whenever `review` is present)
so an unhandled review key (no cursor yet, layer returned false) does not
scroll the list by 18 px underneath the review layer.

## Which element scrolls the diff differs per host (measured)
600-line working-tree diff, Vite dev, 2026-09-11:
- Diff tab: `[data-testid=diff-lines]` scrolls (243/10926) and virtualizes
  (34 rows mounted).
- Commit dialog: `[data-testid=commit-diff]` scrolls (521/10950); the list
  inside is content-sized, all 607 rows are mounted, nothing virtualizes.
`DiffView`'s `scrollToRow` therefore calls the virtualizer and then walks
from the row to the nearest ancestor with `overflow-y: auto|scroll` that
actually overflows, adjusting `scrollTop` by hand and vertically only:
`scrollIntoView({ block: "nearest" })` also pulls the horizontal scroll
back to the row's left edge, undoing a scroll to the right on long lines.

# Diff rows: text selection next to line selection (v0.16.0)

Owner, 2026-09-11: "The new reset lines in the diff view is amazing, but
it's missing the ability to select text for copy-paste." The rows had
`user-select: none` from the v0.13.14 line selection (`app.css`
`.diff-row-selectable`). Now only the gutter opts out, and `DiffView`'s root
sets `user-select: text` so a host that turns selection off for its chrome
cannot take the code with it.

## A click on selected text is dispatched BEFORE Chromium collapses the selection
Do not tell a drag from a click by asking `window.getSelection()` at click
time. Press on already-selected words, release without moving: Chromium
dispatches `click` first and collapses the selection after, so the handler
sees a non-empty selection and treats the click as the end of a drag (the
line never gets picked; caught by `diff-text-selection.spec.ts` on the first
run). `DiffView` records the mousedown point and passes `moved` (> 3 px) to
`onLineClick`; `useDiffLineSelection.clickLine` reads it as a drag only when
the pointer moved AND text is selected.

## Shift+mousedown extends the browser's text selection
With a caret left by the previous click, Shift+mousedown natively extends a
text selection to the new point, which would read as a drag. Shift+click is a
line range, so `DiffView.guardShiftClick` calls `preventDefault()` on the
mousedown and clears any text selection. Ctrl+mousedown needs nothing: it
does not touch the selection.

## Ctrl+C rebuilds the text from the row elements
Native copy would paste `+    return x` with the marker, and the gutter's
line numbers sit inside the DOM range even though they are `user-select:
none`. `DiffView.copyPlainText` clamps the selection range to each row's
`.diff-row-text`, drops the `.diff-row-sign` span's selected characters, and
sets `text/plain` itself — Git Extensions' `FileViewer.CopyToolStripMenuItemClick`
strips the same prefixes. The Browse menu's "Copy selected lines" keeps the
markers on purpose (patch-shaped copy).

## Driving a real drag from Playwright
`rectOf` in `tests/e2e/diff-text-selection.spec.ts` measures the words with a
DOM `Range` in-page; `mouse.down` two pixels left of the first word and
`mouse.up` two pixels right of the last gives the exact words (the caret
snaps to the nearest glyph boundary, half a 12 px monospace glyph is wider
than 2 px). `Control+C` reaches the `copy` event in headless Chromium; read
the clipboard back with `navigator.clipboard.readText()` after
`context.grantPermissions(["clipboard-read", "clipboard-write"])` (not on
webkit, see e2e-shared-engine-serial.md).

## Known limit: Ctrl+C sees only the mounted rows (v0.16.0 review, finding 6)
Diffs above 200 lines are virtualised, and `DiffView.copyPlainText` walks
the `.diff-row` elements that are in the DOM. A selection dragged past the
virtualised window and copied with Ctrl+C yields the mounted intersection
only. Recorded 2026-09-11, not fixed: the fix is to rebuild the text from
the diff model over the selected row range, not from the elements.

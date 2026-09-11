# Review mode in the Diff tab (v0.17.0 integration)

Captured 2026-09-11 by the INTEGRATION worker. Design: docs/design/review-mode.md.

## Who computes what
- `BottomPanel.tsx` derives the review key (`commitId ?? <headId>-<worktree|index>`,
  null until HEAD is known) and parses the shown diff's row keys once
  (`rowKeysOf`, memoised on the diff text so a status-poll refetch of the same
  worktree diff is free). Both go down to `DiffTab` and to `ReviewBar`.
- `hooks/useDiffReview.ts` (called by `DiffTab`) owns the cursor, the marks,
  the `review` hotkey layer and Enter / Shift+Enter / n over the file list.
  The commit dialog (v0.17.2) should call the same hook with its own lists.
- The row parser lives in `components/diffLines.ts` since v0.17.0; DiffView
  imports it. Do not add a lowercase function export to `DiffView.tsx`:
  `react-refresh/only-export-components` is an error.

## Semantics the e2e relies on
- Space / x with no cursor act on the first unreviewed line of the file (else
  the first changed one) and put the cursor there. Toggling the mode on does
  not place a cursor; it only focuses the diff.
- The cursor belongs to one `(mode, key, shown path)` and starts over when
  any of them changes — also when switching *back* to a file. It is reset with
  react.dev's "setState during render when a prop changed" pattern, not an
  effect, so there is no frame with a stale cursor.
- `doc.changed` is the shown file's changed-line count this iteration
  (whole-review counts arrive with numstat in v0.17.3). `n` across files uses
  a per-key cache of counts for files already opened; a file never opened
  under the key is assumed to have work.
- The bar renders only on the Diff tab (`tab === 1`): on the other tabs the
  commit rows' diff is idle and it would read "0 / 0 lines".

## Tab strip
`BottomPanel`'s `<Tabs>` now sits in a flex `Box` that carries the bottom
border, with `ReviewBar` at `ml: auto`. Non-Tab children inside `<Tabs>` get
cloned with Tab props and warn; keep the bar outside it.

## jsdom landmine for hotkey tests
`createRoot(container).render()` clears the container's existing children.
A `[data-hotkey-surface]` element the test dispatches keys from must be
appended to `document.body` *beside* the container, or the first render
detaches it and the Host on `window` never sees the event
(`useDiffReview.test.ts`).

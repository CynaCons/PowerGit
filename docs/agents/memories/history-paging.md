# History paging (useHistory)

Captured 2026-09-11 during v0.16.0 (file history).

## A second `useHistory` is fine; give it a memoised `filter`
`frontend/src/hooks/useHistory.ts` takes an optional `filter` (the engine's
`?path=` query, v0.16.0). Each instance owns a layout Worker, its paging refs
and its SHA-keyed selection, so `FileHistoryView.tsx` mounts its own next to
App's without touching the main history. The `filter` object must be
memoised: `fetchPage` depends on it, and through it `extendHistory` and
`reloadHistory` change identity — a fresh object every render would reload
every render.

## Reset + near-end race: page 0 appended to itself
Found by `file-history.spec.ts` when the follow toggle changed the filter:
the grid showed `doc-3, doc-rename, doc-3, doc-rename`. Sequence:
`resetHistory()` clears `revCount`/`historyComplete` but the grid still
shows the previous rows until the worker's reset reply; `RevisionGrid`'s
near-end effect re-fires because `onNearEnd` changed identity, calls
`extendHistory(0 + PAGE)`, which fetches page 0 in parallel with
`reloadHistory`'s page 0; the second answer was appended to the first.
`reloadHistory`'s `abortInflight()` does not help — the extend fetch starts
later, from a render effect, with the same `histGen`. Two guards now:
`onNearEnd` returns until `loaded` (the first page of this list is in), and
`extendHistory` drops an answer when `revCount` moved while it was in
flight. The main view could hit the same race on a repository switch when
the previous repository had fewer rows than the viewport.

## `--parents` is what keeps a filtered list drawable
With a path filter git only lists the commits that touched the path, so a
row's real parents are usually absent and the layouter would open a lane
for each that never closes. `--parents` makes git rewrite `%P` to the
nearest listed ancestor (verified on git 2.38.1: the rename commit's parent
became the previous change, not the unrelated commit in between). Same as
GE's `FilterInfo.GetRevisionFilter`. Do not drop it when touching the
filtered log's arguments.

## `extendRun` is keyed by generation (v0.16.0 review, finding 5)
`resetHistory` bumps `histGen` and aborts the in-flight page, but the tail
run's promise stayed in `extendRun` until its `finally` ran; a
`reloadHistory` for the new filter that reached `extendHistory` first got
the old promise back and loaded nothing. Now `extendRun` is
`{ gen, run }`, `extendHistory` reuses it only for the current generation,
`resetHistory` clears it, and a run's `finally` clears the slot only when
the slot is still its own (a superseded run must not drop its successor
or its spinner). `useHistory.test.ts` renders the hook (jsdom) and leaves a
tail page unanswered while the filter changes.

## Testing the hook: pass stable callbacks
`extendHistory` / `reloadHistory` are memoised on `onFailure` and
`setEngineError`. A harness that passes inline lambdas re-creates them
every render, so a FileHistoryView-style "reset then reload" effect keyed
on them loops forever (the first draft of `useHistory.test.ts` grew the
fake client's call list until V8 ran out of heap at 4 GB). Hoist them.

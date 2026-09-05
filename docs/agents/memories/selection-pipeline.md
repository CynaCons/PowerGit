# Selection → details → diff pipeline (v0.13.14)

What happens after a row click, in order, and where the time goes. Measure
before touching any of it: `tests/e2e/diff-latency.spec.ts` (in-page
timing, numbers in the report annotations) and `perf.spec.ts` (click →
highlight budget). Both run against the Vite dev build; production is
4-5x faster on render and identical on the network.

## Pipeline
1. Click → `setSelectedSha` (App). RevisionGrid re-renders; RepoTree and
   CommandBar are `memo`ised with `useStable` callbacks so they do not.
   Highlight: ~25-30 ms production, 100-180 ms dev (React dev instrumentation).
2. After that commit, an App effect calls `prefetchCommit(client, sha)`
   (`src/engine/commitCache.ts`): `GET /commits/{id}` and
   `GET /commits/{id}/changes` start immediately and are memoised per
   (repo, sha, diff options) in a 64-entry LRU. Do **not** move the prefetch
   into the click handler: a response landing mid-render interrupts React's
   deferred render and dev got slower, not faster (measured 2026-09-05).
3. BottomPanel receives `current` through `useDeferredValue`, renders its
   loading state, and its effect asks the cache for the same promises
   (leading-edge debounce: immediate on a single change, 150 ms only when
   the previous change was <250 ms ago). `reloadTick` evicts the entry.
4. `/changes` = file list + first file's diff, from `git diff-tree` and
   `git show -p <id>` run concurrently; the first `diff --git` section is
   cut from the whole-commit patch (`GitHost.FirstPatchSection`) with a
   fallback to per-file `GetDiff` when the patch is capped, binary, or the
   first section is not the first listed file. `QueryTests` asserts the
   combined answer equals `/files` + `/diff`.
5. The diff effect only fires for user-driven file or option changes:
   `filesFor`/`diffFor` refs stop it from requesting the previous file
   against the new commit (that wasted request was in every click before).
6. DiffView renders rows as plain classed elements (`app.css .diff-row*`)
   and virtualizes above 200 lines (was 2000 with a MUI Box per cell): an
   818-line first diff cost 400 ms to mount in dev and its teardown made the
   next click take 600-800 ms, with the diff at 3.2 s.

## Numbers (2026-09-05, this repository, steady state)
| build | click → highlight | click → diff on screen |
|---|---|---|
| before (dev) | 100-350 ms | 1000-1350 ms median, 2500 worst |
| after (dev) | 70-175 ms | 310-580 ms for every sampled row, large diffs included |
| after (production) | 25-35 ms | 180-260 ms |

Remaining cost is git process spawn (three concurrent processes at
120-200 ms each); a backlog item. The e2e spec mocks `/changes` as well as
`/diff` (large-content.spec) because the first diff no longer travels on
`/diff`, and a cached commit is not re-requested on a tab switch. While the 17k-commit history is still
streaming (~15 s after boot) page appends add 150-400 ms long tasks; the
spec waits for the history to settle so that cost is tracked separately.

# Engine: revision ordering and working-tree diffs

Captured 2026-09-02 during v0.12.0, worker `engine-queries`.

## `--topo-order` can starve every branch but the one it starts on
`git log --topo-order` doesn't just "avoid intermixing" at merge points -- with
a plain diverging (never remerged) history it behaves like a depth-first
tunnel: once it starts descending a branch's parent chain, it keeps going as
long as that chain has *any* unblocked next commit, regardless of whether
another branch's tip is individually newer than the next commit in the
current chain. Verified empirically: a `main` with 50 commits one minute
apart and a `side` branch with one commit dated squarely between `main-40`
and `main-41` is **excluded** from `git log --topo-order -n10` (main-49..40
fill the page) but **included** with `git log --date-order -n10`. This is
exactly the "/revisions only shows the current branch" symptom -- `-n800`
paging plus `--topo-order` lets one active branch's history crowd out
everything else, however recent.

## GE's `RevisionSortOrder.GitDefault` passes no order flag at all
`src/app/GitCommands/RevisionReader.cs` `BuildArguments` only ever adds
`--author-date-order` or `--topo-order`; the default enum value
(`RevisionSortOrder.GitDefault`, see `AppSettings.cs` `RevisionSortOrder`)
matches neither branch, so GE's actual default `git log` invocation carries
**no sort flag**, relying on git's own default (reverse-chronological by
commit date). `PowerGit.Engine` `GitHost.Queries.cs` `ListRevisions` now uses
an explicit `--date-order` instead: verified byte-identical ordering to the
no-flag default on the repro above, and it additionally guarantees "no parent
shown before all its children," which the no-flag default does not formally
promise. Prefer `--date-order` over reproducing the bare default.

## The lane layout does not require topo-order
`frontend/src/graph/layout.ts` `createLayouter().append()` only ever resolves
a row's segments against `rows[i-1]` (the immediately preceding row already
committed to the `rows` array) -- it has no notion of "same branch" or
"contiguous line of history." The only invariant it needs is **a commit must
never be rendered before all of its children** (both `--topo-order` and
`--date-order` guarantee this; the bare no-flag default does not, formally).
`frontend/src/graph/synthetic.ts` already generates genuinely interleaved
branch histories (random branch/merge points, then just reversed to
newest-first) and `layout.test.ts`'s "merge occupies a second lane" test
covers exactly this interleaving -- so switching `/revisions` off
`--topo-order` needed no frontend change.

## Untracked file diffs: `git diff` vs `git diff --no-index`
`git diff -- <path>` (no `--cached`) only compares the working tree to the
index. For a path git has never seen -- not even `git add`ed -- there is
nothing in the index to diff against, so it silently returns empty output
(the "no diff" bug for new/unstaged files). Fix in `GitHost.Queries.cs`
`GetWorkTreeDiff`: check `git ls-files --error-unmatch -- <path>` (exit 0 =
tracked-in-index, which includes staged-but-uncommitted adds; exit 1 =
truly untracked) and only for the untracked+unstaged case, fall back to
`git diff --no-index -- <null-file> <path>`. That command exits 1 when the
sides differ (expected for any non-empty new file, not an error -- only
`>1` is), and treats a literal `"/dev/null"` as a magic empty-file sentinel
**even on Windows Git** (verified: identical output to using the Windows
`"NUL"` device), so it never actually touches a filesystem path for the
empty side. The DTO shape (`DiffDto`) needed no changes.

## Where the working-tree diff is (and isn't) called from the frontend
`frontend/src/components/CommitDialog.tsx` is the only caller of
`fetchWorkTreeDiff` (`/diff/worktree`) -- it's the "commit view" file list.
`frontend/src/components/BottomPanel.tsx` (revision grid's file/diff panel)
never calls it: its effects guard `if (id.length < 16) return` before
fetching, so it only ever diffs real commit SHAs via `fetchDiff`/`GetDiff`
(`git show`), never the working tree. No frontend changes were needed for
the untracked-file fix.

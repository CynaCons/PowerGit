# Graph ref filter (v0.18.5)

Owner (2026-09-15): "I need to be able to select which branch I see in the
graph. Like a dynamic filtering. It can be a mode, that when entered, I can
activate branches on the left side explorer and only these are visible."
Design: `docs/prototypes/branch-visibility.html` tab 4, variant A (the
owner's pick). GE parity: `FilterInfo.GetBranchRevisionFilter` "Show
filtered branches" hands `git log` explicit revs.

## Engine contract
`GET /repos/{id}/revisions?ref=<full name>&ref=…` (`RevisionFilter.Refs`,
`GitHost.Queries.ListRevisions`): the stream is the history of those refs
**plus HEAD**, with the same `--date-order`, `--decorate=short`, paging,
pretty format and optional `path=` filter as the unfiltered stream. A bare
`ref=` (an explicit empty set) is HEAD alone; no `ref` at all is every ref.
Names are full: `refs/heads/x`, `refs/remotes/origin/x`, `refs/tags/x` —
the tree's `RefItem.fullName`.

## Why explicit revs go on stdin, not argv and not `--glob`
- argv: Windows tops out near 32K characters, which killed `/revisions`
  around 900 refs before v0.12 (that is why the unfiltered log uses the
  `--branches --remotes --tags` globs). A "Show all" on a heavy repository
  is every ref, so the filter cannot be argv either.
- `--glob=` / `--branches=<pattern>`: fnmatch patterns, so a name with `*`,
  `?` or `[` would match more than itself, and one name per pattern is
  still argv.
- `--stdin`: one full name per line, LF, then close. git reads up to the
  first empty line and dies on a line starting with `-`. HEAD (and
  `refs/stash` when present) stay on the command line, so an empty payload
  is "HEAD only". Verified on git 2.38.1: `--stdin` combines with a
  command-line pathspec after `--`.
- The unfiltered request builds a byte-identical command line to before
  (`QueryTests.ListRevisions_with_refs_lists_those_refs_and_head_only`
  pins it through the command log).

## Validation: nothing that is not a ref name reaches git
`GitHost.ValidatedRefLines` runs `for-each-ref --format=%(refname)
refs/heads refs/remotes refs/tags` and refuses (ArgumentException → 400
naming the offender) anything not in that set: an unknown name, a short
name (`main`), `HEAD`, `refs/stash`, a range (`a..b`), anything starting
with `-`. Duplicates are sent once. So the payload can never carry an
option or a revision expression git would resolve on its own.

## GitProcess stdin (`GitProcess.Run(..., stdin:)`)
`RedirectStandardInput` only when a payload is given (a git that prompts
must not hang on a pipe nobody closes); UTF-8 **without BOM** (a BOM
would be the first bytes of the first ref name); the readers start first,
then the payload is written and stdin closed, so a child that exits before
reading it all cannot wedge the write (IOException swallowed; the exit
code says what happened). Same timeout, tree kill and stdout cap.
`GitHost.RunTimedWithStdin(cwd, ms, ct, stdin, args…)` — a distinct name,
not a `RunTimed` overload: a `string` before the `params` would silently
become the first argument of every existing `RunTimed(cwd, ms, ct,
"rev-parse", …)` call (C# prefers the candidate with more declared
parameters). The command log shows `(N refs on stdin)`, never the names.

## What is remembered, and where
`frontend/src/graph/graphRefs.ts`: `localStorage` key
`pg.graphRefs.<repoId>` → `{ mode, refs }` (full names). Only the **ticks**
are stored and sent; the checked-out branch is never in the set.

## The always-HEAD rule
The engine keeps HEAD on the command line, so the checked-out branch is in
the graph whatever the ticks say. The UI therefore does **not** name it in
the request: `RepoInfo.branch` is a snapshot from `/repos/open` (stale
after a checkout, `HEAD` when detached) and a stale name would be a 400
once that branch is deleted; the tree's `current` flag arrives after the
first page and would force a second load at boot. In the tree the current
branch's box is ticked, disabled and carries a lock ("The checked-out
branch is always shown"); `graphRefCounts` counts it once even when it is
also ticked (it was ticked before being checked out). Detached HEAD with
nothing ticked: `ref=` → HEAD alone.

## A filter change is reset + reload, like the file history's
`hooks/useGraphRefFilter.tsx` memoises the filter by content (equal set →
same object; `useHistory.fetchPage` and `reloadHistory` are memoised on
it) and, on a change for the **same** repository, calls
`resetHistory({ keepSelection: true })` then `reloadHistory()` — the
`keepSelection` option is new: the SHA re-resolves to its row when the
commit is still listed, row 0 otherwise. A repository switch is not a
filter change (useRepoState loads that one). The near-end race noted in
[history-paging.md](history-paging.md) is covered by the same `loaded`
guard the file history relies on.

## Tree and grid surfaces
`RepoTreeHeader.tsx` (funnel `tree-filter-mode` with `aria-pressed`, the
strip `tree-filter-strip` with `tree-filter-count`, `tree-filter-all`,
`tree-filter-exit`), `RepoTreeRows.tsx` (`tree-check` on the input with
`data-checked` true|some|false, `tree-lock`), `repoTreeChecks.ts` (the
tri-state and toggle rules, pure), `GraphFilterChip.tsx`
(`graph-filter-chip`, `graph-filter-count`, × "Show all refs") through
`RevisionGrid.headerExtra`. Spec: `tests/e2e/graph-branch-filter.spec.ts`.
Entering the mode starts from the checked-out branch alone; Exit and the
chip's × clear the ticks; Show all ticks every ref and stays in the mode.

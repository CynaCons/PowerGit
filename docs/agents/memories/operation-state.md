# Operation state: merge, rebase, cherry-pick, revert and conflicts (v0.15.0)

Owner (2026-09-08): "we will integrate merges, rebase and conflict
resolution by reintegrating what Git Extensions does natively."

Until v0.14.3 the engine's posture was **a conflict is an error**:
`Rebase`, `CherryPick` and `Revert` ran `--abort` themselves and threw, so
the repository was never left mid-operation and the UI never had a state
to render. v0.15.0 inverts that deliberately. Read this before touching
anything in `GitHost.Sequencer.cs`.

## The contract

A stopped operation is a **state, not an error**:

- non-zero exit **and** a detected operation state → HTTP 200 with the new
  `RepoStatusDto` (the caller reads `state` and `conflicts`);
- non-zero exit that left nothing behind → 400 with git's stderr.

Everything is synchronous with the 300 s timeout and returns
`RepoStatusDto`; none of it is a job. These operations finish in well
under a second, and what the UI needs back is the state, not streamed
output (`GitHost.Jobs.cs` only publishes output at completion anyway).
`/fetch`, `/pull` and `/push` remain jobs.

## Detecting the state

`GetOperationState(root)` in `GitHost.Queries.cs` reads the git dir
(`rev-parse --absolute-git-dir`) the way git's own `wt-status.c` does, in
this priority: `rebase-merge/` (head-name, onto, msgnum, end, stopped-sha,
interactive, message), then `rebase-apply/` (next, last), then `MERGE_HEAD`
(+ `MERGE_MSG`), then `SQUASH_MSG`, then `CHERRY_PICK_HEAD` /
`REVERT_HEAD` (+ `sequencer/todo` for the total). `OntoName` is resolved
with `name-rev` only when a ref points exactly at that sha.

`RepoStatusDto` carries `State` ("none" | "merging" | "rebasing" |
"cherry-picking" | "reverting"), `Operation` (`RepoOperationDto`) and
`Conflicts` (`ConflictFileDto[]`), all trailing defaulted parameters so
older clients keep parsing the JSON.

## The "C" status letter

`GetStatus` used to relabel untracked `??` as `"U"`, which collided with
git's unmerged codes. Now: unmerged XY (DD, AU, UD, UA, DU, AA, UU) go to
`Unstaged` **once per path** with status `"C"`; untracked stays `"U"`.
`Conflicts` comes from `git ls-files -u -z`, and each file's kind
(both-modified, deleted-by-us, added-by-them, …) is derived from which
stages are present. The frontend has a `C` colour in `theme/tokens.ts`.

## Watcher

`GitHost.Watch.cs` `ClassifyPath` treats MERGE_HEAD, CHERRY_PICK_HEAD,
REVERT_HEAD, REBASE_HEAD, AUTO_MERGE, MERGE_MSG, SQUASH_MSG and anything
under `rebase-merge/`, `rebase-apply/`, `sequencer/` as a refs change, so
an external `git merge` that stops reaches the UI on its own.

## Resolving

`POST /conflicts/resolve {paths[], take}` follows GE's
`HandleConflictSelectSide`: `git checkout-index -f --stage=2|3|1 -- path`
then `git add`, because during a rebase "ours" and "theirs" are inverted —
the command stays **stage-based** and only the UI's labels swap. `mark` is
a bare `git add`, `delete` is `git rm -q`. `POST /mergetool {path}` starts
`git mergetool --no-prompt -y` detached, like the difftool.

## Interactive rebase without an editor

No engine self-invocation (in `dotnet test` the process is testhost.exe,
and the packaged sidecar is renamed). Git runs `GIT_SEQUENCE_EDITOR`
through `sh -c`, and Git for Windows ships `sh` and `cp`. Two phases:

- **Capture** (`POST /rebase/todo`):
  `GIT_SEQUENCE_EDITOR="f(){ cp \"$1\" '<gitdir>/powergit/todo-capture.txt'; exit 1; }; f"`
  plus `git rebase -i`. Git writes its own todo (so `--autosquash` order
  and `--rebase-merges` label/reset/merge lines come for free), the editor
  copies it out and fails, and git removes its state and re-applies the
  autostash. POST, not GET, because it touches the git dir and must take
  the Mutate gate.
- **Run** (`POST /rebase` with `todo`): the engine writes the final todo
  and runs with `GIT_SEQUENCE_EDITOR="cp '<gitdir>/powergit/todo.txt'"`
  and `GIT_EDITOR=true`. Reword and squash-with-message are **not** editor
  interactions: they become `pick|squash sha` plus
  `exec git commit --amend -q -F '<gitdir>/powergit/msg-n.txt'` emitted
  after the squash chain ends.

`<gitdir>/powergit/` holds the todo and message files (not %TEMP%: they
must survive a stop on conflicts and an engine restart) and is deleted
whenever no operation remains. Paths inside the editor string are
forward-slash and single-quoted for MSYS `sh`.

Two git facts worth remembering: git 2.38 ignores `--autosquash` on a
non-interactive rebase, so autosquash runs through `-i` with
`GIT_SEQUENCE_EDITOR=true`; and dirty-tree guards use `status -uno`
(tracked only), because untracked files neither block a merge nor get
stashed by autostash.

## Tests

`SequencerTests.cs` (32 facts) covers every path against throwaway
`TempRepo` repositories with their own identity. Never run merge, rebase
or reset tests against a real repository.

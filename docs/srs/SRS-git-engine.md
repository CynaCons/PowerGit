# SRS — Git engine

Headless C# sidecar extracted from Git Extensions `GitCommands`. Feature tag: `ENG`.

Traces up to: [PRD.md](../../PRD.md) §4; memory `docs/agents/memories/git-extensions-map.md`.

## Runtime

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-ENG-001 | The engine shall target `net10.0` (not `net10.0-windows`) and shall not reference WinForms. | Linux load; WinForms is the portability blocker. | Test (build on Linux CI when it exists; `dotnet build` of the engine project) | `Directory.Build.props` today violates this for the solution — engine project must opt out |
| SRS-ENG-002 | The engine shall invoke the `git` executable resolved from PATH (or a user-configured path), not a hardcoded `git.exe`. | Windows, Linux, and macOS all ship a `git` binary under different names/paths. | Test | `Executable.cs` |
| SRS-ENG-003 | The engine shall use the system Git installation; PowerGit shall not bundle a Git distribution. | Same contract as Git Extensions; distro git on Linux is the point. | Review | PRD §3.5 |
| SRS-ENG-004 | `[linux]` `[macos]` Credential storage shall go through git's credential helper (or Git Credential Manager), not `AdysTech.CredentialManager`. | That package is Windows-only. | Review | `GitExtUtils.csproj` |
| SRS-ENG-005 | Working directory, `GIT_DIR`, and encodings for each invocation shall match Git Extensions `GitModule` behaviour unless an SRS says otherwise. | Behavioural compatibility is the product. | Test | `GitModule.cs` |

## Capabilities (v1)

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-ENG-010 | The engine shall open a repository from a filesystem path and report if the path is not a git work tree. | Navrail and folder picker. | Test | GitModule |
| SRS-ENG-011 | The engine shall stream revisions for the graph (all reachable refs as Git Extensions does by default) including object id, parents, author, dates, subject/body, and ref labels. | Graph + grid. | Test | `RevisionReader.cs` |
| SRS-ENG-012 | The engine shall compute revision-graph lane/segment data for each loaded revision (reuse `RevisionGraph` model). | React must not invent a second lane algorithm in v1. | Analysis | `RevisionGrid/Graph/RevisionGraph.cs` |
| SRS-ENG-013 | The engine shall return the file list and textual diff for a selected commit (and for working directory / index artificial revisions). | Bottom panel. | Test | FileStatus / diff |
| SRS-ENG-014 | The engine shall stage, unstage, and create a commit from a message + staged index. | Commit overlay. | Test | GitModule commit |
| SRS-ENG-015 | The engine shall list local branches, remote-tracking branches, remotes, and submodules for the left panel. | Left tree. | Test | LeftPanel data |
| SRS-ENG-016 | The engine shall open a submodule path as a repository (same engine, new module). | Double-click submodule. | Test | Submodules |
| SRS-ENG-017 | The engine shall support fetch, pull, and push against a named remote (credentials via git helper). | Toolbar verbs around the graph. | Demo | GitModule |

## Merge, rebase and conflicts (v0.15.0)

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-ENG-030 | The engine shall report the repository's operation state (none, merging, rebasing, cherry-picking, reverting) with its details (branch being rewritten, target, step and total, stopped commit, interactive flag) as part of the repository status. | The UI cannot offer Continue/Skip/Abort for a state it cannot see. | Test | `SequencerTests`, `GetOperationState` |
| SRS-ENG-031 | The engine shall list conflicted files with the stages present (base, ours, theirs) and a conflict kind. | The resolve dialog names what happened per file. | Test | `ls-files -u`, `ConflictFileDto` |
| SRS-ENG-032 | An operation that stops on conflicts shall leave the repository in that state and answer with it, not abort it. | Aborting on the user's behalf discards their merge; Git Extensions stops and offers to resolve. | Test | `SequencerTests` |
| SRS-ENG-033 | The engine shall merge a named branch with the fast-forward mode (only, allow, no), squash, message and autostash options, and shall continue or abort a stopped merge. | GE `FormMergeBranch` parity. | Test | `POST /merge`, `/merge/continue`, `/merge/abort` |
| SRS-ENG-034 | The engine shall rebase onto a commit with autostash, rebase-merges and autosquash, and shall continue, skip or abort a stopped rebase. | GE `FormRebase` parity. | Test | `POST /rebase`, `/rebase/{action}` |
| SRS-ENG-035 | The engine shall return git's own rebase todo for a range and shall run a rebase from an edited todo (pick, reword, edit, squash, fixup, drop, reorder) without any interactive editor. | Interactive rebase in a GUI; git's todo carries autosquash order and merge topology for free. | Test | `POST /rebase/todo`, `/rebase` with `todo` |
| SRS-ENG-036 | The engine shall resolve a conflicted path by taking a named stage, marking it resolved, or deleting it, addressing stages by number rather than by the words ours and theirs. | Those words are inverted during a rebase. | Test | `POST /conflicts/resolve` |
| SRS-ENG-037 | The engine shall open the repository's configured mergetool for a conflicted path, and shall say so plainly when no mergetool is configured. | Resolution outside the app is a first-class path. | Test | `POST /mergetool` |
| SRS-ENG-038 | The engine shall return the changed files, and the diff of one file, between two commits or between a commit and the working tree. | The Compare submenu. | Test | `GET /compare` |
| SRS-ENG-039 | The engine shall stream an archive of a commit in zip or tar.gz. | GE's Archive command. | Test | `GET /commits/{id}/archive` |
| SRS-ENG-040 | A file reset shall take a scope: the whole way to HEAD, the working tree only (restored from the index), or the index only (leaving the file on disk). | The diff view resets what the user is looking at, and only one of the three matches each row. | Test | `POST /files/reset` `scope`, `ResetTests` |
| SRS-ENG-041 | A path git does not track shall be deleted by a reset under every scope, since no scope has a source to restore it from. | Owner's choice for new files, and the only honest reading of "reset" for content git never saw. | Test | `ResetTests` |
| SRS-ENG-042 | Applying a patch shall optionally target the index together with the working tree, and shall optionally use a 3-way merge against the blobs the patch records. | Undoing a selection taken from a commit must land staged and must survive the file having moved on since. | Test | `POST /patch` `index`, `threeWay`, `ResetTests` |
| SRS-ENG-043 | The engine shall refuse a patch larger than its ceiling, and shall refuse index and cached together, before running git. | The route previously validated nothing and would write any request body to disk. | Test | `ResetTests` |

## Commit dialog file menu (v0.16.0)

Git Extensions' `FileStatusList` context menu, as the engine serves it under `/files/*`.

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-ENG-044 | The engine shall set and clear the skip-worktree and assume-unchanged index bits on given tracked paths, and shall refuse an untracked path or one outside the working tree. | GE "Skip worktree" / "Assume unchanged" check items. | Test | `POST /files/skip-worktree`, `/files/assume-unchanged`, `FilesTests` |
| SRS-ENG-045 | The repository status shall carry both bits on every listed row and shall list, separately from the unstaged and staged rows and without counting them, the flagged tracked paths git leaves out of `status`; the same list shall be available on its own. | Git hides such files by design; the UI needs them to show the check marks and to let the user clear the bit again (GE "Show skip-worktree files"). | Test | `RepoStatusDto.Hidden`, `StatusFileDto.SkipWorktree/AssumeUnchanged`, `GET /files/hidden`, `FilesTests` |
| SRS-ENG-046 | The engine shall append given patterns to the repository's `info/exclude`, each on its own line, and shall bump the change stream since that file is outside the watched paths. | GE "Add file to .git/info/exclude"; the Unstaged list must drop the file without waiting for the next poll. | Test | `POST /files/exclude`, `FilesTests` |
| SRS-ENG-047 | The engine shall open a working-tree file with the OS default handler or with a named program, and shall open it for editing with git's `core.editor` when one is set (falling back to the OS handler for terminal editors), refusing paths that do not exist or escape the working tree and reporting a program that fails to start. | GE "Open working directory file" / "with..." / "Edit working directory file". | Test | `POST /files/open`, `/files/edit`, `FilesTests` |
| SRS-ENG-048 | The engine shall stop tracking given paths (`git rm --cached`, files kept on disk) and shall rename or move one path through `git mv`, refusing an existing target. | GE "Stop tracking this file" and "Rename / move". | Test | `POST /files/untrack`, `/files/move`, `FilesTests` |

## File history (v0.16.0)

Git Extensions' `FormFileHistory`: the revision stream limited to one path.

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-ENG-049 | The revision stream shall accept a path filter and then list only the commits that touched that path, with the same paging, ordering and ref labels as the unfiltered stream, and with each commit's parents rewritten to the nearest listed ancestor so the filtered commits form one connected graph. | GE `FilterInfo.GetRevisionFilter` adds `--parents` with a path filter; the lane layout only ever resolves a row against its listed parents. | Test | `GET /revisions?path=`, `RevisionFilter`, `QueryTests`, `ApiTests` |
| SRS-ENG-050 | With renames followed (the default) the filter shall include every name the file had along HEAD's history, found by a `--follow` walk, and each listed commit shall carry the file's name at that commit; a folder path (trailing `/`) shall never follow. Renames off, exact renames and copies only, full history and simplified merges shall be selectable, as in GE's file history menus. | GE `RevisionGridControl.BuildPathFilter` takes the two-step route because `git log --follow` skips commits when combined with graph options. | Test | `RevisionDto.Path`, `follow`/`exact`/`full`/`simplify`, `QueryTests` |

## Ref filter (v0.18.5)

Git Extensions' `FilterInfo` "Show filtered branches": the revision stream limited to the history of chosen refs.

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-ENG-051 | The revision stream shall accept a set of full ref names (`refs/heads/`, `refs/remotes/`, `refs/tags/`) and then list the history of those refs plus HEAD (an empty set: HEAD alone), with the same paging, ordering, decorations and optional path filter as the unfiltered stream. Every name shall be checked against the repository's actual refs before any git command sees it; an unknown name, a short name, a revision expression or anything starting with `-` shall be refused with a 400 that names it. The names shall reach `git log` on stdin (`--stdin`), never on the command line, and the command log shall show their count, not the names. An unfiltered request shall produce the same git command line as before the filter existed. | GE `FilterInfo.GetBranchRevisionFilter` ("Show filtered branches") passes explicit revs to `git log`; argv tops out near 900 refs on Windows (the `--branches --remotes --tags` globs of the unfiltered stream exist for that reason), and a "Show all" on a heavy repository is every ref. | Test | `GET /revisions?ref=<name>&ref=…`, `RevisionFilter.Refs`, `GitHost.ValidatedRefLines`, `GitProcess` stdin, `QueryTests`, `ApiTests`, `GitProcessTests` |

## Patch export (v0.18.6)

Git Extensions' `FormFormatPatch` (`git format-patch --find-renames --find-copies --break-rewrites` over a range into a directory), reduced to one commit at a time and handed to the caller as text.

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-ENG-052 | The engine shall stream one commit's patch in mailbox format (`git format-patch -1 --stdout` with `--find-renames --find-copies --break-rewrites`, binary diffs included) as `text/x-patch` under the file name git itself would write (`0001-<%f>.patch`, chopped as git chops it), and the pending changes of the working tree or the index (`git diff --binary`, `git diff --cached --binary`) as `<repo>-worktree.patch` / `<repo>-index.patch`. The revision shall be verified before the stream starts; an unknown revision, a merge commit and an unknown scope shall answer 400 with a message that names the culprit. The engine shall never write the file: the shell or the browser saves it where the user points. The download routes shall accept the engine token in the query, as `/events` does, because a browser download carries no header. | Owner (2026-09-15): "export a patch from a commit … from the right click menu"; the patch must apply whole with `git am`, so GE's flags and `--binary` stay on. | Test | `GET /commits/{id}/patch`, `GET /worktree/patch?scope=`, `GitHost.OpenPatch`, `GitHost.OpenWorktreePatch`, `EngineAuth.AcceptsQueryToken`, `PatchTests` |
| SRS-ENG-053 | Checkout shall take a remote branch the three ways Git Extensions offers (`As`): `track` creates a local branch of a given name tracking it (`checkout -b <name> --track <remote>`), `reset` moves an existing local branch onto the remote's commit and checks it out (`checkout -B <name> <remote>`), `detached` checks the commit out with no branch (`checkout --detach`); `LocalChanges` says what happens to a dirty tree — `keep` (git's own carry-over, refused when it would conflict), `stash` (a stash before, popped after; a pop conflict is the operation's error), `discard` (`checkout -f`). `GET /branches/divergence?local=&remote=` shall answer the two counts of `rev-list --left-right --count local...remote` so the UI can say how many commits a reset makes unreachable. The old `{ref, force}` request shall keep working. | Owner (2026-09-16): "when I hit checkout branch on a remote branch, it should offer me the possibility to create a new local branch for that remote branch or to reset the current local existing branch and move it to remote ref"; GE `FormCheckoutBranch` (rbCreateBranchWithCustomName, rbResetBranch, rbDontCreate, the Local changes group). | Test | `POST /checkout` `CheckoutRequest.As/Name/LocalChanges`, `GET /branches/divergence`, `GitHost.Checkout`, `CheckoutTests` |

## Review files (v0.19.0)

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-ENG-054 | The engine shall keep one review document per key under `<repo>/.powergit/reviews/<key>.json` behind `GET/PUT/DELETE /repos/{id}/reviews/{key}`. The key shall match `^[0-9a-f]{40}([0-9a-f]{24})?(-(worktree\|index))?$` and the final path shall still pass the in-root check. After checking that the body is a JSON object, the engine shall store its text verbatim apart from exactly one final newline, using a temporary file and rename. The first write shall ensure the exact line `/.powergit/` is present in `.git/info/exclude` and bump the status stream. Review routes shall remain outside the mutation gate. | `docs/design/review-mode.md` section 2: the file lives in the repository because an agent in the repository reads it over MCP; git's own never-committed exclude keeps the repository clean. | Test | `GET/PUT/DELETE /repos/{id}/reviews/{key}`, `GitHost.ReadReview/WriteReview/DeleteReview`, `GitHost.EnsureExcluded`, `ReviewsTests` |

## Windows isolation

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-ENG-020 | The engine project shall not take a dependency that forces `UseWindowsForms` or a Windows TFM. | One leak re-breaks Linux. | Test (csproj / build) | engine csproj |
| SRS-ENG-021 | Settings and logs shall use a per-OS application data directory, not `System.Windows.Forms.Application.UserAppDataPath`. | That API is WinForms. | Review | `AppSettings.cs` |

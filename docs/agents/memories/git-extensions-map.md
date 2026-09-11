# Git Extensions map (fork baseline)

Captured 2026-08-20 from `master` at `7f75cee29`.

## The portable git brain vs the Windows body
- Git process wrapper: `src/app/GitCommands/Git/Executable.cs` (`IExecutable` / `ProcessWrapper`).
- Repo façade: `src/app/GitCommands/Git/GitModule.cs`.
- Revision stream: `src/app/GitCommands/RevisionReader.cs` (binary `git log` format, encoding, notes, reflog).
- Solution TFM is `net10.0-windows` (`eng/RepoLayout.props`) with `UseWindowsForms` on by default (`Directory.Build.props`). That is why Linux fails, not because C# or git are Windows-only.
- `GitCommands` already branches on `OperatingSystem.IsWindows()` for path comparison and mergetool exe names. Good sign for a `net10.0` extract; not proof it builds without WinForms.

## WinForms leaks into "non-UI" projects
- `GitExtUtils` references `AdysTech.CredentialManager` (Windows).
- `AppSettings` uses `Application.UserAppDataPath` (`src/app/GitCommands/Settings/AppSettings.cs`) — `System.Windows.Forms.Application`.
- `Executable.cs` / `RevisionReader.cs` `using GitUI;` — that is the `GitExtUtils` `GitUI` namespace (interop helpers), not necessarily the WinForms project, but the name collision is a footgun.

## Graph
- Lane model and row provider: `src/app/GitUI/UserControls/RevisionGrid/Graph/` (`RevisionGraph`, `Lane`, `RevisionGraphSegment`, `MaxLanes = 40`).
- WinForms paint: `Graph/Rendering/GraphRenderer.cs`.
- Grid chrome: `RevisionGridControl.cs`, `RevisionDataGridView.cs`.
- `AppSettings.HighlightAuthoredRevisions` + `AuthorRevisionHighlighting` (`RevisionDataGridView.GetBackground`: a background brush on every row whose author email equals the selected revision's, or the user's own `user.email` with nothing selected) → PowerGit author discs (v0.18.1, `graph/authorIdentity.ts`): an initials disc per row coloured by a stable hash of the author, a primary ring on the selected author's discs and a bold name — never the row background (see [webkitgtk-css.md](webkitgtk-css.md)); Appearance → "Author discs" and the graph pill's Mark toggle are the switches. GE matches by email; PowerGit by the author name the grid shows.
- ~~Prefer exposing lane/segment data from C# and painting in React over a second lane algorithm.~~ **SUPERSEDED (v0.13.3):** GE's `RevisionGraph` lives in the WinForms-bound `GitUI` project and cannot be referenced from the `net10.0` engine, and the layout has to run in a Web Worker next to the grid. The lane algorithm is therefore a TypeScript reimplementation (`frontend/src/graph/layout.ts` ports `BuildOrderedRowCache` + `RevisionGraphRow.BuildSegmentLanes`), and parity is proven with golden fixtures generated from GE's own `RevisionGraphTests` snapshots (`tools/ge-parity/`, `layout.ge-parity.test.ts`). Not ported: `StraightenLanes` / `StraightenDiagonals` (look-ahead post-passes that revise earlier rows) and the `ReduceGraphCrossings` ordering used when `MergeGraphLanesHavingCommonParent=false`; those are the documented divergences.

## Browse chrome (the UX spec)
- Left tree: `src/app/GitUI/LeftPanel/` (repo objects: branches, remotes, submodules).
- Bottom commit info: `src/app/GitUI/CommitInfo/`.
- File list + diff: `src/app/GitUI/UserControls/FileStatusList*.cs`, `CommitDiff*.cs`.
- Commit dialog: under `src/app/GitUI/CommandsDialogs/` (FormCommit family). PowerGit v1 treats this as an overlay, not a philosophy change.

## Dialog map (v0.15.0)

Which GE form each PowerGit surface answers to. GE's source is on the
`master` mirror under `src/app/GitUI/CommandsDialogs/`.

| Git Extensions | PowerGit |
|---|---|
| `FormMergeBranch` | `dialogs/MergeDialog.tsx` (ff only / allow / no-ff, squash, message, autostash) |
| `FormRebase` | `dialogs/RebaseDialog.tsx` + `dialogs/InteractiveRebaseDialog.tsx`; its Continue / Skip / Abort / Solve-conflicts buttons live in `components/OperationBanner.tsx` instead, because the state outlives any dialog |
| `FormResolveConflicts` | `dialogs/ResolveConflictsDialog.tsx`; the stage-based `HandleConflictSelectSide` in `GitModule.cs` is the model for `POST /conflicts/resolve` |
| `RevisionGridControl` context menu | `dialogs/revisionMenuModel.ts` (the item model) rendered by `dialogs/RevisionContextMenu.tsx`; ref chips get `dialogs/RefContextMenu.tsx` |
| `FormCommit` fixup/squash items | the commit dialog opened with a `fixup!` / `squash!` message |
| The "Git command log" window | `GitConsole.tsx`: a dock line that opens a panel, rather than GE's separate window — the owner called that one "too intrusive" (see [git-command-log.md](git-command-log.md)) |
| `FormSettings` Git config pages | PowerGit's settings **page** (`settings/SettingsView.tsx`, v0.18.0), not a modal: it replaces the graph, has a contents column and a search box, and applies every change as it is made (Git keys through one-key `PUT /config`); scopes are a toggle in the Git identity and Tools headers, not separate pages. See [settings.md](settings.md) |
| `FileStatusList` reset / delete items | `CommitFileContextMenu.tsx` in the commit dialog (the full menu since v0.16.0, see below), `DiffContextMenus.tsx` in the Browse Diff tab. GE has one meaning of "reset to HEAD"; PowerGit needs three, because the Browse panel shows worktree-vs-index, index-vs-HEAD and commit-vs-parent in the same place (`browseReset.ts`, v0.15.5) |
| `FileViewer` line staging / resetting (`ApplySelectedLines`) | `hooks/useDiffLineSelection.ts` + `DiffContextMenus.tsx`. GE's reverse apply on a revision is `git apply --3way --index --whitespace=nowarn`; PowerGit's engine takes the same flags on `POST /patch` |
| `PatchManager` (synthesizing a patch from selected lines) | `frontend/src/patch/partial.ts`. Same idea on the engine's diff text; the one rule that matters is which side the patch describes — forward applies need the target to equal the preimage, `--reverse` applies the postimage |
| — (PowerGit-only: review mode, v0.17) | `frontend/src/review/` (`reviewModel.ts` document + line keys, `reviewState.ts` toggle + session documents), tokens `review.*` / `--pg-review-*`, hotkey scope `review`. GE has no line-by-line review; the design is `docs/design/review-mode.md` |

## Menu and dialog labels: parity is functional, the voice is the app's (v0.18.2)
GE's menus are Title Case ("Checkout Branch...", "Create Tag Here...");
PowerGit keeps the item, the order and the `ctx-*` id, and writes the label
in the app's sentence case with the … character ("Checkout branch…",
"Create tag here…", "Delete branch…", "Configure remote…", the
"Checkout branch" dialog title). Do not copy a GE caption verbatim into
`revisionMenuModel.ts` or `RefContextMenu.tsx`; match the voice of the
labels around it.

## FileStatusList context menu → commit dialog file menu (v0.16.0)

Owner: "on the left we have the files staged and unstaged. We need functional
parity with what GE has. Should be able to right click on my files and do
operations on them." GE builds the menu in
`src/app/GitUI/UserControls/FileStatusList.ContextMenu.cs`
(`UpdateStatusOfMenuItems` = the visibility rules, `RevisionDiffController.cs`
= the `ShouldShowMenu*` predicates) and orders it in
`FileStatusList.Designer.cs` (`ItemContextMenu.Items.AddRange`). `FormCommit`
uses that same control for both lists
(`Unstaged.BindContextMenu(RescanChanges, canAutoRefresh: true, stage, null)`,
`Staged.BindContextMenu(…, null, unstage)`), so the Unstaged list is GE's
"work tree" selection (`IsAnyItemWorkTree`) and the Staged list its "index"
selection (`IsAnyItemIndex`). PowerGit: `components/commitFileMenuModel.ts`
(the item model, unit-tested), `CommitFileContextMenu.tsx` (drawing +
dispatch), `commitFileMenuActions.ts`, `CommitFileMenuDialogs.tsx`, engine
`GitHost.Files.cs` under `/files/*` (`FilesTests.cs`, SRS-ENG-044…048).

GE order, item by item (separators are GE's `sep*` names):

| GE item (`tsmi*`) | Shown when (GE) | PowerGit |
|---|---|---|
| Update / Reset / Stash / Commit submodule, `sepSubmodule` | selection is a submodule | **Hidden.** `GET /status` does not tell a submodule from a file (`--porcelain=v1`). Needs `--porcelain=v2` submodule fields first. |
| Stage selected (bold) | any work-tree row | `ctx-stage-selected` "Stage file / N files", hotkey S; the dialog's own callback. Disabled on a hidden (flagged) row: `git add` refuses a skip-worktree path (exit 1) and silently skips an assume-unchanged one. |
| Unstage selected (bold) | any index row | `ctx-stage-selected` "Unstage …", hotkey U |
| — | (toolbar buttons in GE) | `ctx-stage-all` "Stage all / Unstage all": the task asked for selected *and* all in the menu. Own engine call (`POST /stage`). |
| Reset file(s) to ▸ First: A `<rev>` / Second: B `<rev>` | any tracked row (`ShouldShowResetFileMenus`) | `ctx-reset-file` ▸ Unstaged: `ctx-reset-index` (GE "First: A Index" = engine scope `worktree`) and `ctx-reset-head` (scope `head`); Staged: `ctx-reset-head` only (GE "First: A HEAD"). Stays enabled for untracked rows: PowerGit deletes them on any reset (owner's choice, SRS-ENG-041), GE disables. |
| Reset chunk of file… / Interactive add… | one work-tree file, not a submodule | **Hidden.** GE runs `git checkout -p` / `git add -p` in a console. PowerGit's equivalent is the diff's line selection: click / Ctrl / Shift on lines, right-click → `CommitDiffContextMenu` "Stage selected lines" / "Reset selected lines" (`useDiffLineSelection.ts`). The file menu cannot see that selection, so no item links to it. |
| Cherry pick changes | revision diffs only (`!IsAnyItemWorkTree`) | n/a in the commit dialog (correctly hidden in GE too) |
| `sepGit` | | divider above "Open with difftool" |
| Open with difftool ▸ (First→Second, Second→Working dir, First→Working dir, remember/diff two) | any row | `ctx-difftool`, one item: for work-tree rows the only meaningful pair is index↔worktree (unstaged) or HEAD↔index (staged), which `POST /difftool/worktree` already does. Custom difftool list: not ported. |
| Open working directory file | one file that exists | `ctx-open-file` "Open" → `POST /files/open` (OS handler: `UseShellExecute` / `xdg-open` / `open`) |
| Open working directory file with… | one file that exists | `ctx-open-with` "Open with…" → prompt for a program (remembered in localStorage, shell: native picker) → `POST /files/open { with }`. GE opens the Windows "Open with" shell dialog (`OsShellUtil.OpenAs`), which has no cross-platform twin. |
| Open this revision (temp file) / …with… | one file of a real revision (`!IsArtificial`) | n/a in the commit dialog (hidden in GE too) |
| Edit working directory file | one file that exists | `ctx-edit-file` "Edit" → `POST /files/edit`: git's `core.editor` (Settings → Tools) when set and not a terminal editor, else the OS handler. GE opens its built-in `FormEditor`; PowerGit has none. |
| Open in Visual Studio | VS installed | **Hidden.** Windows-only VS integration (`VisualStudioIntegration`), stays on Windows per this map. |
| Save selected as… | real revision only | n/a in the commit dialog |
| Rename / move | one tracked file, not a submodule | `ctx-move-file` "Rename / move…" → prompt → `POST /files/move` (`git mv`) |
| Delete file | all selected exist, artificial revision | `ctx-delete-file` "Delete file / N files…", the dialog's own confirm + `POST /files/delete`; disabled when everything selected is already gone |
| `sepFile` | | divider above "Copy path" |
| Copy path(s) ▸ (relative POSIX / relative native / full native (bold) / full WSL / full Cygwin) | any row | `ctx-copy-path` ▸ `ctx-copy-full` (native separators, from `RepoInfo.root`), `ctx-copy-relative` (git's forward slashes). WSL/Cygwin flavours: not ported. |
| Show in folder | any row whose file or parent exists | `ctx-show-in-folder` → Tauri `opener.revealItemInDir` (`diagnostics/snapshot.ts revealInFolder`), one call per selected file like GE. **Hidden in the browser** (`isTauriShell()` false): there is no file manager to reach from a web page. The contract's optional engine route `/files/reveal` was not added. |
| `sepBrowse` | | divider above "View file history" (since v0.16.0) |
| Show in File tree, Filter in grid, Find in commit files using git-grep…, Show 'Find in commit files…' | Browse-tab binding only (`BindContextMenu` 9-arg overload) | n/a in the commit dialog (GE hides them there as well) |
| File history | one tracked row (`ShouldShowMenuFileHistory`) | `ctx-file-history` "View file history", Ctrl+Shift+H, since v0.16.0: closes the dialog and opens the file history view (next section). Disabled on a multi-selection, hidden for untracked rows, as in GE. |
| Blame | one tracked row | **Hidden.** No blame view in PowerGit yet. |
| Find file… | any | **Hidden.** In-list search dialog; the commit lists are short and the Ctrl+F filter is backlog. |
| `sepIgnore` | any work-tree row, or a tracked single file | divider above "Add to .gitignore…" |
| Add file to .gitignore | any work-tree row, not a submodule | `ctx-ignore-file`, the dialog's own `IgnoreDialog` (one pattern at a time, so disabled on a multi-selection with a hint; GE's dialog takes several) — Unstaged list only, as in GE |
| Add file to .git/info/exclude | same | `ctx-exclude-file`: one file → `IgnoreDialog target="exclude"` with the pattern anchored like GE (`/dir/file`); several → a confirmation listing the patterns → `POST /files/exclude`. The engine bumps its change stream because `.git/info` is outside the watched paths. |
| Skip worktree (check) | work-tree rows with a tracked file | `ctx-skip-worktree` (`role=menuitemcheckbox`, `aria-checked`) → `POST /files/skip-worktree { paths, on }` |
| Assume unchanged (check) | same | `ctx-assume-unchanged` → `POST /files/assume-unchanged` |
| Stop tracking this file | one tracked file | `ctx-stop-tracking` → confirm → `POST /files/untrack` (`git rm --cached`) |
| `sepScripts`, Run script | user scripts with `OnEvent == ShowInFileList` | **Hidden.** No script engine in PowerGit. |
| (toolbar › Settings) Show skip-worktree files / Show assumed-unchanged files | | `ctx-show-skip-worktree` / `ctx-show-assume-unchanged` at the bottom of the menu, persisted (`powergit.commit.showHidden`). Git hides flagged files from `status`, so without these the file the user just flagged has no row to un-flag it from; the commit dialog has no list toolbar to put them in, and the menu is where the file just disappeared. The Unstaged list appends `GET /files/hidden` rows with git's `ls-files -v` letter (S / h / s) as the status. |
| (toolbar › Settings) Show ignored files / Show untracked files | | not ported |

Status changes made by the menu's own engine calls reach the dialog through
the engine's change stream (index writes are watched; the exclude route bumps
the version by hand), i.e. ~0.5–1 s later, unless `CommitDialog.tsx` passes
the optional `onStatus` prop to `CommitFileContextMenu`, which then hands the
answered status over at once (the pre-v0.16.0 items go through the dialog's
callbacks and always refresh at once).

## FormFileHistory → the file history view (v0.16.0)

Owner: "In main view, in the file tree, right click a file and show the
file history. Here again, we have to be functionally equivalent to GE." GE
is `src/app/GitUI/CommandsDialogs/FormFileHistory.cs` (+ `.Designer.cs`): a
separate window holding a `RevisionGridControl` with a path filter, a tab
control (Commit, Diff, View, Blame), a toolbar (load, "Show full history"
drop-down, blame options, git command log) and the grid's own
`FileHistoryContextMenu`. It is opened by `UICommands.StartFileHistoryDialog`
from `FileStatusList.ContextMenu.cs` (`tsmiFileHistory`, hotkey
`RevisionDiffControl.Command.ShowHistory` = a bare `H` on the focused list;
`tsmiBlame` does the same with `showBlame: true`). PowerGit shows it in
place of the main graph and bottom panel (no second window: the shell has
one webview, see [commit-window.md](commit-window.md)), and the main
history's state stays mounted in `App.tsx`, so Escape brings it back with
no refetch.

| Git Extensions | PowerGit |
|---|---|
| `RevisionGrid.SetAndApplyPathFilter(path)` → `BuildPathFilter`: a `git log --name-only --follow --find-renames --find-copies -- path` walk collects every name the file had, then the real log runs with `--parents [--full-history [--simplify-merges]] -- <names>` (`FilterInfo.GetRevisionFilter`), because `--follow` alone skips commits with graph options | `GET /revisions?path=&follow=&exact=&full=&simplify=` → `GitHost.Queries.cs ListRevisions(filter)` + `FollowFileNames`: the same two steps, same `--date-order --branches --remotes --tags HEAD [refs/stash]` and paging as the graph. `--parents` rewrites `%P` (verified on git 2.38) so the layouter's rule "a row resolves against its listed parents" still draws one connected line. Each row carries `RevisionDto.Path`, the file's name at that commit (the walk's answer, else the nearest newer row's, else the requested path); an unfiltered list omits the field. The walk is HEAD-only, like GE's, so a rename that only happened on another branch is not followed. |
| `GetRevisionFileName` (name at a revision, for the viewers) | `RevisionDto.Path` above; `fileHistoryModel.ts pathAtRow` |
| `FormFileHistory` window; `Text = "File History - path (name at revision)"` (`SetTitle`) | `components/FileHistoryView.tsx` in the content column (`data-testid="file-history"`), header "File history" + `fileHistoryTitle(path, at)` |
| `followFileHistoryToolStripMenuItem` "Detect and follow renames" (`AppSettings.FollowRenamesInFileHistory`), `followFileHistoryRenamesToolStripMenuItem` "exact renames and copies only" (enabled when following), `showFullHistoryToolStripMenuItem` "Show full history", `simplifyMergesToolStripMenuItem` "Simplify merges" (enabled with full history) | the four header check boxes `file-history-follow` / `-exact` / `-full` / `-simplify`, same enable rules, remembered in `localStorage` `powergit.fileHistory.options` (`fileHistoryModel.ts`); a change reloads the list (`useHistory` with a new `filter`) |
| `toolStripSplitLoad` "Load file history" (+ "Load history on show", "Load blame on show") | `file-history-reload`; the list always loads on show |
| `tabControl1`: `CommitInfoTabPage`, `DiffTab`, `ViewTab`, `BlameTab`; `UpdateSelectedFileViewers` removes Commit/View/Blame for an artificial row, Diff/View/Blame when the file is not in the revision, and loads only the selected tab | `fileHistoryTabs(row, path)`: Commit + Diff + View for a commit, Diff + View for a pending row (View is a PowerGit addition there, see the next section; GE drops it for artificial rows), no View for a folder; only the visible tab requests (`/commits/{id}` for Commit, `/commits/{id}/diff?path=<name at commit>` or `/diff/worktree` for Diff, `/commits/{id}/blob` or `/blob/worktree` for View). **Blame: not ported** (no blame view in PowerGit yet; `toolStripBlameOptions` and its nine settings go with it). |
| Artificial commits in the grid (the file is modified in the work tree / index) | `withArtificialRows(rows, counts, anchor)`: the pending rows sit on HEAD when it is in the list, else on the newest commit that touched the path (the `anchor` parameter, added for this) |
| `FileHistoryContextMenu` on the grid: Copy to clipboard ▸, Open with difftool (F3), Difftool selected ↔ local, Save as, Manipulate commit ▸ (Revert, Cherry pick), the two follow toggles | the main grid's `RevisionContextMenu` (a superset: checkout, reset, create branch/tag, cherry-pick, revert, compare, archive…) and `RefContextMenu`, through `hooks/useGridMenus.ts`; the follow toggles are in the header. Save as, Difftool selected ↔ local: not ported. |
| Escape in any viewer closes the form (`EscapePressed += Close`) | Escape anywhere in the view (`onKeyDown` on its root; MUI menus and dialogs stop their own Escape first) and the header's X (`file-history-close`) → `useFileHistory.close` + `focusGrid()` |
| Opened from `FileStatusList` (Browse Diff tab, File tree tab, FormCommit lists) with the selected revision, or with `showBlame` | `CommitFileTree.tsx` menu (`ctx-tree-file-history`, folders as `path/`), `DiffContextMenus.tsx` (`ctx-diff-file-history`), `commitFileMenuModel.ts` (`ctx-file-history`, the commit dialog closes first), and `browse.fileHistory` = Ctrl+Shift+H on the file the bottom panel has selected (`useFileHistory.openSelected`; GE's bare `H` is not bound). The commit the panel showed is preselected when it is in the list (`FileHistoryTarget.sha`). |
| Hotkey `RevisionGridControl.Command.ResetRevisionPathFilter` = Ctrl+Shift+H (clears the grid's path filter) | not bound as such; PowerGit's Ctrl+Shift+H opens the file history (owner's ask) and Escape clears it |

## File Tree and blob of the artificial rows (v0.16.0)

Owner (2026-09-11): "accessing a file in the file tree when selecting the
working directory pseudo commit doesn't load. It should load the latest
commit on that branch on which the working directory is based." The
`WORKTREE` / `INDEX` ids of `graph/artificial.ts` are not git objects:
`/commits/WORKTREE/tree` and `/blob` answer 400 ("Not a valid object
name"), and `BottomPanel` only requested a blob for a real commit, so the
pane stayed on "Loading file..." forever. GE's resolution:

| Git Extensions | PowerGit |
|---|---|
| `GitModule.GetTree(commitId)` for `IsArtificial`: `git ls-files --stage` (the index, `--cached` for IndexId) instead of `ls-tree` | The tree is **HEAD's**: `BottomPanel` passes `headId` to `CommitFileTree` for a pending row (`/commits/<head>/tree`). Files only in the index or untracked are not listed (GE lists staged adds); a later iteration can fold `status` into the tree. |
| `FileViewer.ViewGitItemAsync`: `WorkTreeId` -> `ViewFileAsync` reads the file from disk; `IndexId` -> the blob id from `ls-files --stage`, `GetFileText(blobId)` | `GET /repos/{id}/blob/worktree?path=&staged=` (`GitHost.GetWorkTreeBlob`): `staged=true` is `git show :path`; else the bytes on disk through `ResolveInRoot` (never outside the repository), capped at `MaxBlobBytes`, NUL means binary, `BoundLines` as `/blob`. Client `workTreeBlob`; `BottomPanel` and `FileHistoryView` pick it when the row is artificial. Never read the disk from React. |
| `FormFileHistory.UpdateSelectedFileViewers`: no View tab for an artificial row | View kept for a pending row, reading the same route (the owner's ask covers the file history's pending row). |

Spec: `frontend/tests/e2e/file-tree-worktree.spec.ts`; xunit
`QueryTests.GetWorkTreeBlob_*`, `ApiTests.Blob_worktree_route_*`.
## Leave on Windows
- `src/native/GitExtensionsShellEx/` Explorer extension.
- `externals/conemu-inside` terminal.
- PuTTY error UI (`FormPuttyError`).
- VSIX / Visual Studio integration.

## Git on Linux
- Engine must invoke `git`, not `git.exe`.
- Credential helper: Git Credential Manager / libsecret / `git-credential`, not `AdysTech.CredentialManager`.
- SSH: OpenSSH, not PuTTY, unless the user configured otherwise.

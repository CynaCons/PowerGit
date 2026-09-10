# SRS — Commit details (bottom panel)

Selected revision: message, metadata, file list, inline diff. Feature tag: `DET`.

Traces up to: [PRD.md](../../PRD.md) §5.2; upstream `CommitInfo` + `FileStatusList` + diff viewers.

## Panel

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-DET-001 | When a revision is selected in the graph, the bottom panel shall show that commit's subject, body, author, committer, hashes, and parents. | Git Extensions commit info. | Test | engine `/commits/{id}`, `BottomPanel` |
| SRS-DET-002 | The bottom panel shall list files changed in the selected revision (or working directory / index when those artificial rows are selected). | Review happens here. | Test | `/commits/{id}/files` |
| SRS-DET-003 | Selecting a file in that list shall show a textual unified diff in the bottom panel. | Review the changes directly there. | Test | `/commits/{id}/diff?path=` |
| SRS-DET-004 | Binary files shall be labelled as binary and shall not dump garbage into the diff pane. | Basic sanity. | Test | diff parser |
| SRS-DET-005 | The file list and the diff pane shall be independently scrollable. | Git Extensions split. | Demo | BottomPanel |
| SRS-DET-006 | The Files and Diff surfaces shall be available without leaving the bottom panel (tabs or split). | Same job as GE bottom area. | Test | BottomPanel tabs |

## Working directory

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-DET-010 | Selecting the working-directory artificial row shall list unstaged changes. | Path into the commit overlay. | Test | SRS-GRAPH-004 |
| SRS-DET-011 | Selecting the index artificial row shall list staged changes. | Same. | Test | SRS-GRAPH-004 |

## Reset from the diff view (v0.15.5)

Owner, 2026-09-09: *"when I'm in the diff view, I should be able to right click
on a file and hit reset. Same for the diff in the diff view. Should be able to
select some line, and hit reset."* And on what it must mean: *"if it's in the
diff of the working directory, it should just reset the staged or unstaged
changes, basically resetting what the user is looking at."*

The panel can be showing any of three diffs, so the same gesture is three
different git operations. The rules are in `components/browseReset.ts`.

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-DET-020 | Right-clicking a file in the Diff tab's file list shall offer a reset of that file, plus Open with difftool and Copy path. | GE's `FileStatusList` context menu, in the surface where the user is already reading the change. | Test | `DiffContextMenus.tsx`, `browse-reset.spec.ts` |
| SRS-DET-021 | Right-clicking inside the diff shall offer a reset of the selected lines; lines shall be selectable by click, Ctrl+click and Shift+click, and a right-click on an unselected line shall select it first. | GE's `FileViewer` line patching. | Test | `useDiffLineSelection`, `browse-reset.spec.ts` |
| SRS-DET-022 | On the working-directory row, a file reset shall restore the file from the index and shall leave that file's staged changes intact. | That row shows worktree-vs-index; resetting to HEAD would destroy staged work the row never displayed. | Test | `ResetScope.Worktree`, `ResetTests`, `browse-reset.spec.ts` |
| SRS-DET-023 | On the index row, a file or line reset shall unstage and shall not modify the file on disk. | That row shows index-vs-HEAD; the working tree is not what the user is looking at. | Test | `ResetScope.Index`, `browse-reset.spec.ts` |
| SRS-DET-024 | On a revision, the action shall be labelled Undo, shall reverse-apply the selection into the working tree and the index, and shall not rewrite history. | Owner: "you just reset what the user has selected and put that in the staged of the current working directory". | Test | `git apply --3way --index --reverse`, `browse-reset.spec.ts` |
| SRS-DET-025 | Every reset from this panel shall be confirmed, and the confirmation shall name what survives; an untracked file, which git holds no copy of, shall get a visibly different confirmation that says it is deleted. | This is a review surface: a mutation here is unexpected, and the dialog is where the three meanings of "reset" are spelled out. | Test | `browseReset.test.ts`, `browse-reset.spec.ts` |
| SRS-DET-026 | Line actions shall be disabled, with the reason as a tooltip, when the diff cannot produce an appliable patch: binary, whole-file add or delete, truncated, or taken with whitespace ignored. | A patch built from a `-w` or truncated diff fails inside git with a message the user cannot act on. | Test | `partialEligibility`, `partial.test.ts` |

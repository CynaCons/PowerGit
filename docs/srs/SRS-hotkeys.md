# SRS — Keyboard shortcuts

Git Extensions hotkeys, rebuilt in the React Browse UI. Feature tag: `KEY`.

Traces up to: [PRD.md](../../PRD.md) §3.1 (Git Extensions is the behaviour spec);
upstream `HotkeySettingsManager.CreateDefaultSettings`, `GitExtensionsFormBase.ProcessCmdKey`,
`FormBrowse.ProcessHotkey`, `FormCommit.ProcessHotkey`, `FileStatusList` (RevisionDiff catalog).

This file is **what**. The catalog in `frontend/src/hotkeys/catalog.ts` is the implementation source of truth.

## Catalog

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-KEY-001 | The UI shall keep a catalog of Git Extensions command ids with default chords, grouped by scope (`browse`, `commit`, `stash`, `dialog`). | Muscle memory is per-form in GE, not one global map. | Test | `catalog.ts` |
| SRS-KEY-002 | For every **available** command, the default chord shall match `HotkeySettingsManager.CreateDefaultSettings` (plus the F5 refresh menu accelerator, which is not in that list). | Wrong defaults train the wrong hands. | Test | `HotkeySettingsManager.cs` |
| SRS-KEY-005 | Commands whose action does not exist in PowerGit shall not be bound. | Silent no-ops teach false muscle memory. | Test | `available: false` |

## Dispatch

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-KEY-003 | When an editable field is focused, a chord that Git Extensions treats as a text-edit key (`IsTextEditKey`) shall type, not run a command. | Commit message and filter boxes must remain typable. | Test | `parse.ts` / `dispatch.ts` |
| SRS-KEY-004 | Letter-only commands (`S`, `U`, …) shall run only when a file-list surface is focused. | GE `FileStatusList` handles `S` via the focused list, not the form catalog. | Test | `data-hotkey-surface="file-list"` |
| SRS-KEY-006 | Toolbar buttons and context-menu items for bound commands shall show the current chord. | Discoverability; GE paints shortcut text on menus. | Demo | `format.ts` |
| SRS-KEY-010 | `F5` shall refresh repository data and shall not reload the SPA / webview. | GE menu accelerator; Vite and WebView2 otherwise reload. | Test | `HotkeyHost` |

## Commit overlay

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-KEY-020 | In the commit overlay, with the unstaged file list focused, `S` shall stage the selected file(s); with the staged list focused, `U` shall unstage them. The same keys shall type into the message field when that field is focused. Multi-select (Shift/Ctrl) shall be honoured, not only a single row. | GE `RevisionDiffControl.Command.StageSelectedFile` / `UnStageSelectedFile`; owner-named. | Test | `CommitDialog` |

## Grid

Keyboard up/down (and page/home/end) on the revision grid remain [SRS-GRAPH-011](SRS-revision-graph.md).

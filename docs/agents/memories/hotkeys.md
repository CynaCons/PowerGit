# Git Extensions hotkeys (PowerGit port)

Captured 2026-08-30 from `master` at `7f75cee29`.

## Where the original lives
- Defaults: `src/app/GitUI/Hotkey/HotkeySettingsManager.cs` `CreateDefaultSettings()`.
- Dispatch: `src/app/ResourceManager/GitExtensionsFormBase.cs` `ProcessCmdKey` → `ProcessHotkey` → `ExecuteCommand`.
- Browse routing: `FormBrowse.ProcessHotkey` then grid / diff / file-tree.
- Commit `S`/`U`: **not** in the FormCommit catalog (`StageSelectedFile` is obsolete there). `FileStatusList` loads the RevisionDiff catalog (`Keys.S` / `Keys.U`) and FormCommit routes leftover keys into `_currentFilesList` only after `IsTextEditKey`. In practice the focused file list's `ProcessCmdKey` runs first, so click-a-file-then-`S` stages; focus the message and `S` types.
- F5 refresh is a **menu** `ShortcutKeys`, not a HotkeySettings entry.

## PowerGit
- Catalog + dispatcher: `frontend/src/hotkeys/`. Do not port the XML `SerializedHotkeys` serializer.
- Letter-only keys require `data-hotkey-surface="file-list"` on the focused list.
- Always `preventDefault` F5 in capture phase or Vite/WebView2 reloads the page.
- Ctrl stays Ctrl on Windows/Linux. Do not silently remap to Meta.

## Typing guard
Port `GitExtensionsControl.IsTextEditKey`: bare `A`–`Z` / digits / OEM / Space / Insert are text-edit; `Ctrl+A/C/V/X/Y/Z`, Backspace, Delete, Left, Right, Home, End too; Up/Down/Page only when `multiLine`.

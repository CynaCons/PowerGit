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

## Layer stack falls through (v0.17.0)
- `Host.tsx` → `dispatchLayers` walks the layer stack top to bottom and stops at the first layer whose handler handles the key. A layer with no hit in its scope, no handler for the hit, or a handler that **returns false** passes the key to the layer below. Before v0.17.0 only the top layer was consulted.
- A disabled layer (`useHotkeyLayer(scope, handlers, enabled=false)`) is not on the stack at all. That is how a modal dialog keeps `browse` silent: `useDialogs().hotkeysEnabled` is false while the commit dialog is open, so the stack is `[commit]`, not `[browse, commit]`. Do not rely on a top layer to *cover* a lower one.
- `global` (recovery, shell only) is still checked before the stack, in every phase.

## Review scope (v0.17.0)
- Scope `"review"` in `catalog.ts`, `ge: null` for all: `review.cycle` Space · `review.reject` X · `review.down` J · `review.downArrow` Down · `review.up` K · `review.upArrow` Up · `review.bottom` Shift+G · `review.end` End · `review.home` Home · `review.top` G (the handler keeps the gg timer and returns false on a single g) · `review.nextUnreviewed` N · `review.nextFile` Enter · `review.prevFile` Shift+Enter · `review.command` `/` (reserved; handler in v0.17.4).
- The whole scope resolves only when `ResolveCtx.reviewFocused && !editing`: the event target is inside `[data-hotkey-surface="review"]` (the diff's scroll container, `DiffView` with a `review` prop) and is not a text field. Bare letters, Space, Enter and arrows never resolve anywhere else, so the review layer can sit over `browse` (Diff tab) or `commit` (dialog) and pass everything else down.
- Bare Space, Enter, J, K, N, X and `/` are bound in no other scope (asserted in `hotkeys.test.ts`); keep it that way or the fall-through starts to matter.

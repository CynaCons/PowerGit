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
- Scope `"review"` in `catalog.ts`, `ge: null` for all: `review.cycle` Space · `review.reject` X · `review.down` J · `review.downArrow` Down · `review.up` K · `review.upArrow` Up · `review.bottom` Shift+G · `review.end` End · `review.home` Home · `review.top` G (the handler keeps the gg timer and returns false on a single g) · `review.nextUnreviewed` N · `review.nextFile` Enter · `review.prevFile` Shift+Enter · `review.command` `/` (reserved; handler in v0.19.3).
- The whole scope resolves only when `ResolveCtx.reviewFocused && !editing`: the event target is inside `[data-hotkey-surface="review"]` (the diff's scroll container, `DiffView` with a `review` prop) and is not a text field. Bare letters, Space, Enter and arrows never resolve anywhere else, so the review layer can sit over `browse` (Diff tab) or `commit` (dialog) and pass everything else down.
- Bare Space, Enter, J, K, N, X and `/` are bound in no other scope (asserted in `hotkeys.test.ts`); keep it that way or the fall-through starts to matter.

## Highlight ancestry (v0.18.4)
- `browse.highlightAncestry` Ctrl+Shift+B, `ge: "ToggleHighlightSelectedBranch"`: the selected row becomes the ancestry root (`useHistory.toggleHighlightRoot`), the same row again exits; a pending row never (`isArtificialId`). Dispatched from `App.tsx`; the handler **returns false while the file history is open** so the key falls through instead of toggling the hidden main grid (GE's FormFileHistory has no such item, and the file history's grid keeps Alt+click and Esc).
- Alt+click on a row (GE's `Alt+LButton`) sets the root in `RevisionGrid.clickRow` and still selects — `RevisionRow.onClick` passes the event for that.
- Escape in the grid's `onKeyDown`, in this order: fold the expanded ref row (v0.18.3), else exit the highlight, else pass on (the file history closes on it). Not in the catalog: Escape is a key the surfaces own.

## Graph navigation (v0.18.12)
- `browse.goToParent` Ctrl+P (`GoToParent`), `browse.goToChild` Ctrl+N (`GoToChild`), `browse.goToHead` Ctrl+Shift+C (`SelectCurrentRevision`), `browse.navigateBack` Alt+Left / `browse.navigateForward` Alt+Right (`NavigateBackward` / `NavigateForward`). GE's defaults from `HotkeySettingsManager` lines 283-301; the BrowserBack/Forward alternates are not bound.
- Registered by `hooks/useGraphNav.ts` on a **second browse layer** of its own (`useHotkeyLayer("browse", …, enabled)`), not in App's handler map: App.tsx sits on the 400-line cap. Two layers of the same scope are fine — `dispatchLayers` walks them all and the ids do not overlap. The layer is off with `dialogs.hotkeysEnabled` false and while the file history is open (GE's FormFileHistory has no navigation either).
- The handlers never return false: Ctrl+P must not reach the browser's print, Ctrl+N its new window, Alt+← its history, even with nowhere to go.
- Ctrl+Shift+C is a text-edit key (`isTextEditKey`: Ctrl+C with Shift ignored), so a focused text field keeps it; Ctrl+P / Ctrl+N are not, so they fire from a text field like every other Ctrl chord. Ctrl+Shift+P stays Quick pull.
- There is no hotkey table in Settings (only the Diagnostics section lists the recovery steps); the catalog and `hotkeys.test.ts` "GE default chords we claim" are the listing.

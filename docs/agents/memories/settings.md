# Settings: the page, the catalog, immediate apply (v0.18.0)

Owner (2026-09-11): "Let's rework the settings panel. It's ugly, poor
layout… We could do something like VS Code." Three layouts were
prototyped in `docs/prototypes/settings-layouts.html`; the owner chose
A, the VS Code page. The dialog, its Save / Cancel and the v0.13.18
drafts are gone.

## Where it mounts

- `frontend/src/components/settings/SettingsView.tsx`, rendered by
  `App.tsx` **inside the `contentRef` box in place of its children** (the
  repo tree, the graph, the splitter, the bottom panel, and the file
  history when one is open). Closing puts back whatever was there;
  nothing behind it is unmounted-and-refetched except the tree/graph
  components themselves (their state lives in App's hooks).
- State: `hooks/useSettingsPage.ts` → `{ open, toggle, close }`. The gear
  (`chrome.openSettings`) and Ctrl+, (`browse.openSettings`) call
  `toggle`, so the gear again is "back". `close` = `setOpen(false)` then
  `focusGrid()`.
- Not a dialog kind: `useDialogs` has no `"settings"`, `AppDialogs` does
  not mount it, there is no `role="dialog"`. Browse hotkeys stay live
  (Ctrl+Space over the page opens the commit dialog, as over the file
  history).
- Keys: `onKeyDown` on the page root (`data-testid="settings-page"`,
  `tabIndex=-1`). Escape with text in the search box clears it; Escape
  otherwise closes. Every `SettingRow` is `tabIndex=-1` too: the Reset
  button leaves the DOM when pressed, and focus must land on the row,
  not on `body`, for the next Escape to be heard.

## The catalog

`settings/settingsCatalog.ts` is the one list of sections and rows:
`{ id: "<section>.<row>", title, description, keywords?, anchor? }`. The
sections, the contents column and the search all read it.

**Adding a setting = one catalog entry + one row in its section
component**:

```tsx
<SettingRow id="behaviour.autoFetch" hidden={!isShown(visible, "behaviour.autoFetch")}
            changed={value !== DEFAULT} onReset={() => setStore(DEFAULT)}>
  <SettingSelect … />
</SettingRow>
```

`SettingRow` renders the title and description from the catalog, the
control, and when `changed`: the 3 px primary bar, the "changed" tag and
the Reset (`data-testid="settings-reset-<id>"`, hover/focus-visible, always
in the DOM). Row root: `settings-row-<id>`, `data-changed`, `id="setting-<id>"`
(contents anchors). `hidden` rows render nothing.

`SettingsSection` (`settings-section-<id>`, `id="settings-<id>"`) shows the
title, the scope switch (git sections) or the "This app, every repository"
pill, a hint, and the status slot `settings-status-<id>` (`Saving…` /
`Saved` / the error). It renders nothing when no row of it is visible.

Search: `matchSettings(query)` → `null` (no query) or the set of ids
whose title | description | keywords contain **every** whitespace-separated
word, case-insensitively. `isShown(visible, id)` / `sectionShown(visible,
sectionId)` are the two helpers everything uses. The count in the box
reads "n settings" / "1 setting"; `settings-empty` when none. Keep the
word "fetch" out of every description but the background fetch's — the
owner's test is "typing fetch leaves the background-fetch setting".

Contents (`SettingsToc.tsx`): `settings-toc-<sectionId>` entries and
`settings-toc-<rowId>` sub-entries for rows with an `anchor`; click →
`scrollIntoView({ block: "start" })` on the section / row (they carry
`scroll-margin-top: 8px`); the list's scroll handler marks the last
section whose top is within 40 px of the list's top (`aria-current`).

## Immediate apply

- **App rows** (`AppearanceSection`, `BehaviourSection`) read the stores'
  hooks (`useThemePreference`, `useBarLayout`, `useZoom`, `useBehaviour`)
  and write on change (`setThemePreference`, `setBarLayout`, `setZoom`,
  `setBehaviour(patch)`). `changed` = differs from the default; Reset
  writes the default. Rows that group keys (the five confirmations, the
  two rebase defaults) use `appRows.ts` `behaviourChanged(value, keys)` /
  `behaviourDefaults(keys)`.
- **Git rows** (`IdentitySection`, `ToolsSection`) each own a
  `useGitConfig(engine, scope)` → `{ cfg, patch, status, reload }`. One
  `scope` state in `SettingsView` feeds both sections' switches.
  `changed` = the value **at this scope** is non-empty; the button says
  **Unset** and sends `""`.
- Text fields (`SettingText`) commit on blur and Enter, only when the text
  differs; selects (`SettingSelect`) on change. Native selects everywhere.
- "Custom command…" in a tool select writes nothing: it shows the name
  field, and the name is written when committed there.

## `PUT /config` one-key semantics and the queue

`GitHost.SetConfig` (engine): a key given as **null / absent is left
alone**, a key given as **`""` is unset** (`git config --unset`), anything
else is set. The client's `saveConfig` forwards `undefined` as absent, so
`patch({ userName: "x" })` sends exactly `{ userName: "x", global }`.

`useGitConfig` sets the field optimistically and enqueues `{ global,
patch }`. One drain loop sends entries one after another; a key edited
again before its save ran is coalesced into the waiting entry (latest
value per key wins, one request). The answer of a save replaces `cfg`
only when nothing newer is waiting and its scope is still the one on
screen. A failed save clears the queue, shows the error in the section
status and `reload()`s the scope so the fields tell the truth again. The
read is cancelled on scope flips (the SettingsDialog comment's reasoning:
a stale answer must not land last).

## Diagnostics and Updates

Diagnostics: the "Logs" row (Open app log → `openConsoleTab("app")` then
`close`; Open developer tools + `devtools-note`; Open logs folder, the
last two desktop-only) and the "Recovery experiments" row
(`RecoverySection`, unchanged test ids). Updates: the row title is
"PowerGit vX.Y.Z" (from `engine.health()`), the controls are the v0.14.0
state machine, and "Open app location" (disabled outside the desktop app).

## Tests

`tests/e2e/settings-page.spec.ts` (the owner's sentences), `settings.spec.ts`,
`shell.spec.ts` (labels never clipped by the list edge), `shell-zoom.spec.ts`
(Dark applies at once, Reset puts it back), `updates`, `app-log`,
`developer-tools`; unit `settingsCatalog.test.ts`, `appRows.test.ts`; visual
`@dialogs` → `settings-page.png`. When asserting the page is gone, query the
heading with `exact: true`: a branch or path containing "settings" (the
commit-info heading "Working directory on wt/v18-settings") matches
`{ name: "Settings" }` otherwise.

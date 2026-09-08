# SRS — Settings and tools

Identity, line endings, default editor/diff/merge. Feature tag: `SET`.

## Identity and CRLF

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-SET-001 | The user shall be able to view and edit `user.name` and `user.email` (local git config preferred). | GE Git Config. | Test | `/config` |
| SRS-SET-002 | The user shall be able to set `core.autocrlf` to `true`, `input`, or `false`. | Windows/Linux line-ending policy. | Test | `/config` |
| SRS-SET-003 | A settings control shall be reachable from the navrail. | PowerNote-style gear. | Demo | navrail |

## VS Code

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-SET-010 | On settings open (and engine start), the engine shall search for VS Code (`Code.exe` / `code`, common install dirs, PATH). | GE EditorHelper + VsCode diff tool. | Test | `VsCodeLocator` |
| SRS-SET-011 | When VS Code is found and `core.editor` is unset, PowerGit shall default editor, diff.tool, and merge.tool to vscode. | Owner: “make it by default”. | Test | `/tools/vscode` |
| SRS-SET-012 | Settings shall show the detected path and allow applying or overriding it. | User remains in control. | Demo | Settings dialog |

## Scopes and tools (v0.15.0)

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-SET-020 | Settings shall edit the identity at one scope at a time, this repository or all repositories, and say which. | Writing a name into the wrong file is invisible until a commit carries it. | Test | `settings.spec.ts` |
| SRS-SET-021 | Where a value in use is inherited rather than set at the scope on screen, settings shall say so. | An inherited name looks identical to a local one. | Test | `/config` origins |
| SRS-SET-022 | The engine shall report the diff and merge tools and editors present on the machine, and settings shall offer them, marking those it did not find. | The user should not have to know git's tool names. | Test | `ToolLocator`, `GET /tools` |
| SRS-SET-023 | Choosing a tool shall write git's own keys (`diff.tool`, `merge.tool`, the tool's path or command, and `mergetool.<name>.trustExitCode`), so git itself drives it. | PowerGit configures git; it does not wrap it. | Test | `SetConfig` |
| SRS-SET-024 | A tool name the engine does not know shall still be settable. | A tool git has never heard of is still the user's tool. | Test | `settings.spec.ts` |
| SRS-SET-025 | Clearing a value shall unset the key rather than writing an empty one. | An empty value is not the same as no value to git. | Test | `SetConfig` |

## Behaviour and confirmations (v0.15.0)

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-SET-030 | Each destructive action that asks for confirmation (force push, delete a branch or tag, reset hard, checkout with changes, abort an operation) shall be individually switchable. | Owner: an enhanced settings menu; a prompt the user has answered a hundred times stops being a safeguard. | Test | `settings.spec.ts` |
| SRS-SET-031 | Confirmations shall default to on. | The safe default is the one that asks. | Test | `behaviour.test.ts` |
| SRS-SET-032 | PowerGit shall optionally fetch the default remote in the background on a chosen interval, and never while the user's own work, a merge or a rebase is in progress, or while the window is hidden. | Ahead/behind is a lie between fetches; a background fetch must not take the write gate from the user. | Test | `useAutoFetch.test.ts` |
| SRS-SET-033 | A background fetch that fails shall be logged, not raised to the user. | The user did not ask for it and may be offline. | Review | `useAutoFetch` |
| SRS-SET-034 | The merge and rebase dialogs shall start from the user's chosen defaults. | The same options, chosen every time, are a setting. | Demo | Settings, Behaviour |
| SRS-SET-035 | Preferences shall be stored per app, not per repository, and survive a restart. | They describe the person, not the checkout. | Test | `behaviour.test.ts` |

## The git command log (v0.15.0)

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-SET-040 | The engine shall keep a rolling log of its last 50 git invocations with the command, exit code, duration and output, and serve it. | Owner: "show the raw text coming from the git command". | Test | `CommandLogTests`, `GET /gitlog` |
| SRS-SET-041 | Credentials shall be stripped from both the recorded command and its output. | A push URL can carry a token, and git echoes it back in errors. | Test | `GitCommandSanitizer` |
| SRS-SET-042 | Each entry shall be capped, and the output cut before it is scanned, so logging does not lengthen a read. | `git log` and `git diff` produce hundreds of kilobytes per call. | Test | `CommandLogTests` |
| SRS-SET-043 | The log shall be reachable without covering the work: one line at the bottom of the window, opening to a panel on demand or with a shortcut. | Owner: Git Extensions' popup "is too intrusive". | Demo | `GitConsole` |
| SRS-SET-044 | A git command that fails shall say so without being looked for, once, and shall not require dismissing. | The one case where the user should not have to go hunting. | Test | `git-console.spec.ts` |

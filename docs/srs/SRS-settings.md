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

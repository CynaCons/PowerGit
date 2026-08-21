# SRS — Application shell

Git Extensions Browse window, rebuilt in React/Tauri. Feature tag: `SHELL`.

Traces up to: [PRD.md](../../PRD.md) §5; upstream `GitUI` Browse form.

## Layout

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-SHELL-001 | The main window shall present, from left to right: navrail, left repo tree, main column (toolbar + revision graph/grid + bottom details). | Git Extensions Browse, plus navrail as the one deliberate addition. | Demo | PRD §5 |
| SRS-SHELL-002 | The left tree and the bottom details panel shall be resizable and collapsible. | Users run this on small Linux laptops and ultrawides. | Demo | Git Extensions splitters |
| SRS-SHELL-003 | The toolbar shall sit above the revision grid and expose Commit (opens overlay), plus fetch/pull/push once those engine verbs exist. | The top bar is part of the Git Extensions muscle memory. | Demo | SRS-CMT-001 |
| SRS-SHELL-004 | Visual density and information hierarchy shall follow Git Extensions (grid-first, chrome-second), not a marketing dashboard. | "Exactly the same frontend" is the brief; navrail is the exception. | Review | PRD §3.1 |

## Window

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-SHELL-010 | Tauri shall provide a native window with standard OS close/minimize/maximize behaviour on Windows, Linux, and macOS. | Distribution target. | Demo | src-tauri |
| SRS-SHELL-011 | The window title shall include the current repo name and current branch when a repo is open. | Git Extensions does this; it is how you find the right window. | Test | AppTitleGenerator |
| SRS-SHELL-012 | Closing the last window shall stop the C# sidecar. | No orphan git processes. | Test | SRS-ARCH-004 |

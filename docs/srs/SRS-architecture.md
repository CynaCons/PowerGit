# SRS — Architecture

Process split and data ownership. Feature tag: `ARCH`.

Traces up to: [PRD.md](../../PRD.md) §4–5.

## Process split

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-ARCH-001 | The product shall run as a Tauri shell hosting a React UI and a separate C# engine process (sidecar). | Tauri is the distribution target; C# is the git brain; they must not share a WinForms process. | Review | PRD §4 |
| SRS-ARCH-002 | The engine shall be the only process that invokes `git`. | One place for encodings, cwd, env, and cancellation. | Test | SRS-ENG-001 |
| SRS-ARCH-003 | The React UI shall not spawn `git` or parse git porcelain itself. | Prevents a second, drifting git implementation. | Review | PRD §3.3 |
| SRS-ARCH-004 | Tauri shall own window lifetime, OS file/folder dialogs, and sidecar spawn/stop. | Thin Rust layer; no git logic in Rust. | Review | PRD §4 |
| SRS-ARCH-005 | The UI and the engine shall communicate through a documented local protocol (HTTP on localhost or stdio JSON-RPC), versioned. | Sidecar must be replaceable and testable without the webview. | Test | engine protocol (TBD) |

## Ownership

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-ARCH-010 | Git repository state (HEAD, index, refs, submodule list, revision graph model) shall be owned by the engine. | Single source of truth; UI is a projection. | Review | GitModule |
| SRS-ARCH-011 | Presentation state (selection, panel sizes, overlay open/closed, navrail expanded) shall be owned by the UI. | Does not belong in git. | Review | frontend |
| SRS-ARCH-012 | The upstream WinForms `GitUI` project shall remain in the tree as the behavioural reference and shall not be required to launch PowerGit. | We fork, we do not gut the spec. | Review | `src/app/GitUI/` |

## Failure

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-ARCH-020 | If the sidecar fails to start or exits, the UI shall show an explicit engine-offline state and shall not pretend the repo is loaded. | Silent empty graph is worse than an error. | Demo | Tauri sidecar |
| SRS-ARCH-021 | The UI shall remain usable enough to quit and to retry the engine when the sidecar is offline. | User must not be stuck in a frozen webview. | Demo | shell |

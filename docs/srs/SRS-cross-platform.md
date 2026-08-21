# SRS — Cross-platform

Linux is the reason for the fork; Windows and macOS ship from the same UI. Feature tag: `XP`.

Traces up to: [PRD.md](../../PRD.md) §1, §4, §8.

## Platforms

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-XP-001 | PowerGit shall run on Windows 10+, a current Ubuntu LTS (or equivalent), and current macOS, with the same React UI. | Cross-platform is the product, not a stretch goal. | Demo | Tauri targets |
| SRS-XP-002 | Linux shall be treated as a first-class runtime: no dead controls, no `git.exe` dialogs, no ConEmu. | Upstream's Linux story is the bug. | Review | PRD §3.4 |
| SRS-XP-003 | A missing `git` on PATH shall produce a single actionable error (install git, or set the git path) on every OS. | First-run failure mode. | Demo | SRS-ENG-002 |
| SRS-XP-004 | Path display and git arguments shall use OS-native separators in the UI and git-compatible (usually `/`) paths in git arguments, as Git Extensions already attempts. | Breaks `git add` on Windows if we get this wrong; breaks nothing if we copy `PathUtil`. | Test | `PathUtil.cs` |
| SRS-XP-005 | `[linux]` The engine shall not require a Windows-only credential or SSH binary. OpenSSH + git credential helper is enough. | PuTTY / wincred are the usual Linux crash sites. | Review | SRS-ENG-004 |

## Distribution

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-XP-010 | Tauri shall produce a per-OS executable/installer that includes the C# sidecar for that OS. | Users do not install a .NET SDK to run a Git GUI. | Demo | sidecar publish |
| SRS-XP-011 | Windows Explorer integration and Visual Studio integration shall not be required on any OS in v1. | Out of scope; would re-bind us to Windows. | Review | PRD §5 out of v1 |

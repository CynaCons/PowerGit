# Git Extensions map (fork baseline)

Captured 2026-08-20 from `master` at `7f75cee29`.

## The portable git brain vs the Windows body
- Git process wrapper: `src/app/GitCommands/Git/Executable.cs` (`IExecutable` / `ProcessWrapper`).
- Repo façade: `src/app/GitCommands/Git/GitModule.cs`.
- Revision stream: `src/app/GitCommands/RevisionReader.cs` (binary `git log` format, encoding, notes, reflog).
- Solution TFM is `net10.0-windows` (`eng/RepoLayout.props`) with `UseWindowsForms` on by default (`Directory.Build.props`). That is why Linux fails, not because C# or git are Windows-only.
- `GitCommands` already branches on `OperatingSystem.IsWindows()` for path comparison and mergetool exe names. Good sign for a `net10.0` extract; not proof it builds without WinForms.

## WinForms leaks into "non-UI" projects
- `GitExtUtils` references `AdysTech.CredentialManager` (Windows).
- `AppSettings` uses `Application.UserAppDataPath` (`src/app/GitCommands/Settings/AppSettings.cs`) — `System.Windows.Forms.Application`.
- `Executable.cs` / `RevisionReader.cs` `using GitUI;` — that is the `GitExtUtils` `GitUI` namespace (interop helpers), not necessarily the WinForms project, but the name collision is a footgun.

## Graph
- Lane model and row provider: `src/app/GitUI/UserControls/RevisionGrid/Graph/` (`RevisionGraph`, `Lane`, `RevisionGraphSegment`, `MaxLanes = 40`).
- WinForms paint: `Graph/Rendering/GraphRenderer.cs`.
- Grid chrome: `RevisionGridControl.cs`, `RevisionDataGridView.cs`.
- Prefer exposing lane/segment data from C# and painting in React over a second lane algorithm.

## Browse chrome (the UX spec)
- Left tree: `src/app/GitUI/LeftPanel/` (repo objects: branches, remotes, submodules).
- Bottom commit info: `src/app/GitUI/CommitInfo/`.
- File list + diff: `src/app/GitUI/UserControls/FileStatusList*.cs`, `CommitDiff*.cs`.
- Commit dialog: under `src/app/GitUI/CommandsDialogs/` (FormCommit family). PowerGit v1 treats this as an overlay, not a philosophy change.

## Leave on Windows
- `src/native/GitExtensionsShellEx/` Explorer extension.
- `externals/conemu-inside` terminal.
- PuTTY error UI (`FormPuttyError`).
- VSIX / Visual Studio integration.

## Git on Linux
- Engine must invoke `git`, not `git.exe`.
- Credential helper: Git Credential Manager / libsecret / `git-credential`, not `AdysTech.CredentialManager`.
- SSH: OpenSSH, not PuTTY, unless the user configured otherwise.

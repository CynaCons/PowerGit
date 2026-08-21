# SRS — Git engine

Headless C# sidecar extracted from Git Extensions `GitCommands`. Feature tag: `ENG`.

Traces up to: [PRD.md](../../PRD.md) §4; memory `docs/agents/memories/git-extensions-map.md`.

## Runtime

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-ENG-001 | The engine shall target `net10.0` (not `net10.0-windows`) and shall not reference WinForms. | Linux load; WinForms is the portability blocker. | Test (build on Linux CI when it exists; `dotnet build` of the engine project) | `Directory.Build.props` today violates this for the solution — engine project must opt out |
| SRS-ENG-002 | The engine shall invoke the `git` executable resolved from PATH (or a user-configured path), not a hardcoded `git.exe`. | Windows, Linux, and macOS all ship a `git` binary under different names/paths. | Test | `Executable.cs` |
| SRS-ENG-003 | The engine shall use the system Git installation; PowerGit shall not bundle a Git distribution. | Same contract as Git Extensions; distro git on Linux is the point. | Review | PRD §3.5 |
| SRS-ENG-004 | `[linux]` `[macos]` Credential storage shall go through git's credential helper (or Git Credential Manager), not `AdysTech.CredentialManager`. | That package is Windows-only. | Review | `GitExtUtils.csproj` |
| SRS-ENG-005 | Working directory, `GIT_DIR`, and encodings for each invocation shall match Git Extensions `GitModule` behaviour unless an SRS says otherwise. | Behavioural compatibility is the product. | Test | `GitModule.cs` |

## Capabilities (v1)

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-ENG-010 | The engine shall open a repository from a filesystem path and report if the path is not a git work tree. | Navrail and folder picker. | Test | GitModule |
| SRS-ENG-011 | The engine shall stream revisions for the graph (all reachable refs as Git Extensions does by default) including object id, parents, author, dates, subject/body, and ref labels. | Graph + grid. | Test | `RevisionReader.cs` |
| SRS-ENG-012 | The engine shall compute revision-graph lane/segment data for each loaded revision (reuse `RevisionGraph` model). | React must not invent a second lane algorithm in v1. | Analysis | `RevisionGrid/Graph/RevisionGraph.cs` |
| SRS-ENG-013 | The engine shall return the file list and textual diff for a selected commit (and for working directory / index artificial revisions). | Bottom panel. | Test | FileStatus / diff |
| SRS-ENG-014 | The engine shall stage, unstage, and create a commit from a message + staged index. | Commit overlay. | Test | GitModule commit |
| SRS-ENG-015 | The engine shall list local branches, remote-tracking branches, remotes, and submodules for the left panel. | Left tree. | Test | LeftPanel data |
| SRS-ENG-016 | The engine shall open a submodule path as a repository (same engine, new module). | Double-click submodule. | Test | Submodules |
| SRS-ENG-017 | The engine shall support fetch, pull, and push against a named remote (credentials via git helper). | Toolbar verbs around the graph. | Demo | GitModule |

## Windows isolation

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-ENG-020 | The engine project shall not take a dependency that forces `UseWindowsForms` or a Windows TFM. | One leak re-breaks Linux. | Test (csproj / build) | engine csproj |
| SRS-ENG-021 | Settings and logs shall use a per-OS application data directory, not `System.Windows.Forms.Application.UserAppDataPath`. | That API is WinForms. | Review | `AppSettings.cs` |

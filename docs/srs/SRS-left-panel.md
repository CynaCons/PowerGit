# SRS — Left panel

Repo objects tree: branches, remotes, submodules. Feature tag: `LEFT`.

Traces up to: [PRD.md](../../PRD.md) §5.4; upstream `src/app/GitUI/LeftPanel/`.

## Tree

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-LEFT-001 | The left panel shall show at least: local branches, remotes (with remote-tracking branches), and submodules. | Named UX. Tags may follow; not required for v1. | Demo | LeftPanel |
| SRS-LEFT-002 | The current branch shall be visually distinct. | Orientation. | Demo | LeftPanel |
| SRS-LEFT-003 | Selecting a local branch in the tree shall select that branch's tip in the graph when the tip is loaded. | Tree and graph are the same repo. | Demo | RevisionGrid |
| SRS-LEFT-004 | Double-clicking a submodule shall open that submodule as the active repository (same window). | Named UX. | Test | SRS-ENG-016 |
| SRS-LEFT-005 | Submodules shall show a dirty/out-of-date hint when the engine reports one. | Git Extensions users look here to see submodule drift. | Demo | SubmoduleStatus |

## Remotes

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-LEFT-010 | Each configured remote shall appear with its name; fetch of that remote shall be reachable from the tree or the toolbar. | Remotes are how Linux users talk to GitHub. | Demo | Remotes |
| SRS-LEFT-011 | The tree shall refresh after fetch/pull/push and after opening a different repo. | Stale remotes are worse than an empty tree. | Test | engine events |

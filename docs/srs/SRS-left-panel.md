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
| SRS-LEFT-006 | The panel shall offer a graph filter mode (v0.18.5): a toggle in its header enters it starting from the checked-out branch alone; while on, every branch, remote branch and tag shows a checkbox, folders and remote roots a tri-state one that toggles their leaves, and the checked-out branch is ticked, locked and marked as always shown; the graph lists the history of the ticked refs plus the checked-out branch and nothing else; a strip under the search box states "n of N refs" with Show all (tick everything, stay in the mode) and Exit; the mode and the ticks are remembered per repository; leaving the mode restores every ref. | Owner (2026-09-15): "select which branch I see in the graph ... a mode, that when entered, I can activate branches on the left side explorer and only these are visible"; GE `FilterInfo` "Show filtered branches". | Test | `RepoTreeHeader`, `RepoTreeRows`, `repoTreeChecks.ts`, `graph/graphRefs.ts`, SRS-ENG-051, `graph-branch-filter.spec.ts` |

## Remotes

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-LEFT-010 | Each configured remote shall appear with its name; fetch of that remote shall be reachable from the tree or the toolbar. | Remotes are how Linux users talk to GitHub. | Demo | Remotes |
| SRS-LEFT-011 | The tree shall refresh after fetch/pull/push and after opening a different repo. | Stale remotes are worse than an empty tree. | Test | engine events |

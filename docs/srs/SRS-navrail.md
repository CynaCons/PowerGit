# SRS — Navrail (repository switching)

New chrome: a left navrail to switch repositories. Feature tag: `NAV`.

This is the one intentional departure from Git Extensions' dashboard / dropdown
repo switcher. Traces up to: [PRD.md](../../PRD.md) §5.5.

## Rail

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-NAV-001 | A vertical navrail on the far left shall list recent repositories (icon + name) and an action to open a folder as a repo. | Named replacement for the old switcher. | Demo | navrail |
| SRS-NAV-002 | Clicking a recent repo shall open it in the current window (replace the active module). | One Browse window, many repos over time. | Test | SRS-ENG-010 |
| SRS-NAV-003 | The active repo shall be highlighted on the rail. | Orientation. | Demo | navrail |
| SRS-NAV-004 | Opening a path that is not a git work tree shall fail visibly and leave the previous repo open. | Do not blank the graph on a bad pick. | Test | SRS-ENG-010 |
| SRS-NAV-005 | Recent-repo list shall persist across app restarts (engine or UI app-data, not WinForms settings). | Git Extensions repository history is the habit. | Test | UserRepositoryHistory |

## Scope

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-NAV-010 | v1 shall not require a dashboard start page. The last repo (or an empty state with Open) is enough. | Navrail replaces the dashboard for switching. | Review | PRD §5.5 |

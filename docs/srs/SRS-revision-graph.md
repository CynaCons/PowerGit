# SRS — Revision graph

Branch visualization and revision grid. Feature tag: `GRAPH`.

This is the primary reason PowerGit exists. Traces up to: [PRD.md](../../PRD.md) §5.1; upstream `RevisionGridControl` + `RevisionGraph`.

## Content

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-GRAPH-001 | The main view shall show a revision grid with a graph column (lanes and segments) plus message, author, date, and short commit-id columns. | Git Extensions Browse default (incl. Commit ID). | Demo | RevisionGrid |
| SRS-GRAPH-006 | Each revision row shall show a shortened SHA-1 (default ~7 hex chars, monospace). | GE Commit ID column. | Test | RevisionGrid |
| SRS-GRAPH-002 | Graph lanes and join/fork segments shall match the engine's `RevisionGraph` model (max 40 lanes as upstream). | A pretty-but-wrong graph is a defect. | Analysis | `RevisionGraph.cs` MaxLanes |
| SRS-GRAPH-003 | Ref labels (local branch, remote, tag, HEAD) shall render on the commit they name. | Scanning branches is the job. | Demo | Ref renderer |
| SRS-GRAPH-004 | Artificial rows for working directory and index shall appear at the top when the repo is not clean, as in Git Extensions. | Commit overlay and bottom panel need those rows. | Test | RevisionGrid artificial commits |
| SRS-GRAPH-005 | Selecting a row shall update the bottom details panel to that revision. | Graph and details are one unit. | Test | SRS-DET-001 |

## Interaction

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-GRAPH-010 | The grid shall virtualize rows so a repo with tens of thousands of commits remains scrollable. | Git Extensions is used on real histories. | Demo | grid virtualization |
| SRS-GRAPH-011 | Keyboard up/down shall move the selection and keep the selected row visible. | Graph is driven from the keyboard as much as the mouse. | Test | RevisionGrid |
| SRS-GRAPH-012 | The graph shall load incrementally (first paint before the full log finishes) without jumping lane layout more than Git Extensions does. | Perceived speed. | Demo | RevisionReader stream |

## Look

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-GRAPH-020 | Lane colours shall be stable for a given lane index (upstream palette), including dark theme. | Recognition across sessions. | Review | `RevisionGraphLaneColor.cs` |
| SRS-GRAPH-021 | The graph column shall remain readable at the default Git Extensions row height; row height shall be user-themeable later, not in v1. | Density is part of the spec. | Review | Git Extensions theme |

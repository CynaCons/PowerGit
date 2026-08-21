# SRS — Commit details (bottom panel)

Selected revision: message, metadata, file list, inline diff. Feature tag: `DET`.

Traces up to: [PRD.md](../../PRD.md) §5.2; upstream `CommitInfo` + `FileStatusList` + diff viewers.

## Panel

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-DET-001 | When a revision is selected in the graph, the bottom panel shall show that commit's subject, body, author, committer, hashes, and parents. | Git Extensions commit info. | Test | engine `/commits/{id}`, `BottomPanel` |
| SRS-DET-002 | The bottom panel shall list files changed in the selected revision (or working directory / index when those artificial rows are selected). | Review happens here. | Test | `/commits/{id}/files` |
| SRS-DET-003 | Selecting a file in that list shall show a textual unified diff in the bottom panel. | Review the changes directly there. | Test | `/commits/{id}/diff?path=` |
| SRS-DET-004 | Binary files shall be labelled as binary and shall not dump garbage into the diff pane. | Basic sanity. | Test | diff parser |
| SRS-DET-005 | The file list and the diff pane shall be independently scrollable. | Git Extensions split. | Demo | BottomPanel |
| SRS-DET-006 | The Files and Diff surfaces shall be available without leaving the bottom panel (tabs or split). | Same job as GE bottom area. | Test | BottomPanel tabs |

## Working directory

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-DET-010 | Selecting the working-directory artificial row shall list unstaged changes. | Path into the commit overlay. | Test | SRS-GRAPH-004 |
| SRS-DET-011 | Selecting the index artificial row shall list staged changes. | Same. | Test | SRS-GRAPH-004 |

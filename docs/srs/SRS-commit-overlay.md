# SRS — Commit overlay

Top-bar commit action and message overlay. Feature tag: `CMT`.

Traces up to: [PRD.md](../../PRD.md) §5.3; upstream FormCommit (presented here as an overlay, not a second top-level window philosophy).

## Open / close

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-CMT-001 | A toolbar Commit action shall open a commit overlay on top of the Browse view. | Named UX: top-bar + popup. | Demo | toolbar |
| SRS-CMT-002 | The overlay shall close on explicit cancel, on successful commit, and on Escape, without discarding the typed message unless the user confirms when the message is non-empty. | Accidental overlay close is common. | Demo | FormCommit |
| SRS-CMT-003 | The overlay shall not be a separate OS window in v1. | Overlays, as specified. | Review | PRD §5.3 |

## Contents

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-CMT-010 | The overlay shall show unstaged and staged file lists and allow stage / unstage of selected files. | You cannot commit from a message box alone. | Test | FormCommit |
| SRS-CMT-011 | The overlay shall provide a commit message editor (subject + body). | The actual job. | Test | CommitMessageManager |
| SRS-CMT-012 | Commit shall be disabled when the index is empty or the message subject is empty. | Match Git Extensions guardrails. | Test | FormCommit |
| SRS-CMT-013 | A successful commit shall close the overlay, refresh the graph, and select the new HEAD. | Immediate feedback. | Test | graph reload |
| SRS-CMT-014 | The overlay shall always show Stage, Stage all, Unstage, and Unstage all actions (disabled when the corresponding list or selection is empty), not hide them until a file is selected. | Git Extensions FormCommit `toolbarStaged` (`toolStageItem`, `toolStageAllItem`, `toolUnstageItem`, `toolUnstageAllItem`). | Test | `CommitDialog` |
| SRS-CMT-015 | The overlay's outer size shall be independent of which file is selected and of diff length; file lists and the diff pane shall scroll internally. | Growing/shrinking the window on selection is disorienting. | Test | `CommitDialog` paper |

## Amend (minimum)

| ID | Requirement | Rationale | Verification | Trace |
|---|---|---|---|---|
| SRS-CMT-020 | The overlay shall offer amend when HEAD is not pushed, or shall clearly refuse amend when it is not safe, consistent with Git Extensions defaults. | Power users hit amend constantly; getting it wrong rewrites published history. | Review | FormCommit amend |

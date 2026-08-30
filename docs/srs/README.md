# Software Requirements Specification (SRS)

ASPICE-style requirements for PowerGit. Each `SRS-<feature>.md` states what
the product **shall** do for one feature, as uniquely-identified, verifiable,
traceable shall-statements.

This layer is **what**. Design notes and code are **how**. Requirements trace
down to implementation files and tests as those appear. Priority is implied by
[PLAN.md](../../PLAN.md), not a column here.

Product intent: [PRD.md](../../PRD.md).

### Implementation status (2026-08)

Implemented and verified: shell, navrail, left panel, revision graph,
commit details, settings, commit overlay. **Not yet implemented** (planned,
see PLAN.md "Later"): working-directory/index artificial rows
(SRS-DET-010/011, SRS-GRAPH-004), fetch/pull/push surfaces, dark theme,
worktrees. Requirements below are the target behavior, not a claim that
everything is built.

## Requirement ID scheme

`SRS-<FEAT>-<NNN>` — `FEAT` is the feature tag, `NNN` a zero-padded sequence
that is never reused. Deleted requirements leave a gap.

| Tag | File | Feature |
|---|---|---|
| ARCH | [SRS-architecture.md](SRS-architecture.md) | Process split, sidecar, no UI git |
| ENG | [SRS-git-engine.md](SRS-git-engine.md) | C# engine, git on PATH, Linux TFM |
| SHELL | [SRS-shell.md](SRS-shell.md) | Browse layout, toolbar, Tauri window |
| GRAPH | [SRS-revision-graph.md](SRS-revision-graph.md) | Branch visualization + revision grid |
| DET | [SRS-commit-details.md](SRS-commit-details.md) | Bottom panel: commit + diff |
| CMT | [SRS-commit-overlay.md](SRS-commit-overlay.md) | Commit message overlay |
| LEFT | [SRS-left-panel.md](SRS-left-panel.md) | Branches, remotes, tags, submodules |
| NAV | [SRS-navrail.md](SRS-navrail.md) | Repo switching |
| SET | [SRS-settings.md](SRS-settings.md) | Identity, CRLF, VS Code tools |
| KEY | [SRS-hotkeys.md](SRS-hotkeys.md) | Git Extensions keyboard shortcuts |
| XP | [SRS-cross-platform.md](SRS-cross-platform.md) | Linux / Windows / macOS |

## Table format

| Column | Meaning |
|---|---|
| **ID** | `SRS-<FEAT>-<NNN>`, stable forever |
| **Requirement** | One testable "shall" |
| **Rationale** | Why it exists |
| **Verification** | `Test`, `Analysis`, `Review`, `Demo` |
| **Trace** | Design §, impl path, test path (filled as code lands) |

Rules: one shall per row; no "nice" / "fast" without a number; implementation-neutral unless the feature is platform-specific (`[linux]` / `[windows]` / `[macos]` / `[web]` / `[engine]`).

## Verification methods

- **Test** — automated (engine unit, Playwright, sidecar contract). Prefer this.
- **Analysis** — argued from algorithm or spec when a test is impractical.
- **Review** — inspection against Git Extensions behaviour or this SRS.
- **Demo** — shown in the running app; record what was demonstrated.

## Coverage rule

A named product feature does not ship without an SRS file. New features get a
new file (or a new section + IDs) **before** implementation, not after.

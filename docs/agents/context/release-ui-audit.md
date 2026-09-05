# UI/UX release audit — 2026-09-05

Audited the v0.13.16 working tree, including eight pre-existing uncommitted UI files. No product changes made. Windows headless Chromium, current C# engine on isolated port 7734, disposable real Git repository. Commit rejection was intercepted in Playwright; no product-repository mutations or real commit submissions. This is a focused audit, not packaged Tauri/Linux release certification.

## P1 — Commit controls fall outside the window at 150% zoom

At 1280×800, set application zoom to 150% and open Commit. After dialog animations finish, the Commit button bounds are x=1083.14, y=800.25, width=123.86, height=54.75. Its entire button is below the viewport; the dialog also clips at the top. Screenshot: `website/public/assets/audit-ui-zoom.png`.

`frontend/src/components/CommitDialog.tsx:126` sizes the dialog to 80vh before `frontend/src/theme/index.ts:162` applies paper zoom. Compensate dialog sizing for app zoom, preserve a visible action footer, and test actual button bounds/visibility at 150% and 200%. Existing resolution coverage exercises shell zoom at 110%, not this modal at 150%.

## P1 — A failed commit gives no visible error

Stage a file, enter a message, submit, and return HTTP 400 with a hook-rejection error from POST `/repos/{id}/commit`. Browser reproduction produced an unhandled page error, but the dialog contained none of the failure text. The message remains, and the Commit button looks ready, leaving users without an explanation of what happened. Screenshot: `website/public/assets/audit-ui-commit.png`.

`CommitDialog.tsx:265` awaits `onCommit` without catching or setting its error state; `hooks/useGitActions.ts:46` propagates the rejection. Catch and render the failure in the dialog, retain the draft, and disable submission while the operation is pending.

## P2 — Message-only amend is blocked

With zero staged files, choose Commit options → Amend last commit, then edit the populated message. The Amend button remains disabled (verified in browser). `CommitDialog.tsx:99` always requires staged files, although `hooks/useGitActions.ts:45` explicitly permits amend without them. Allow a nonempty message when amend is active, and cover a clean-worktree message-only amend.

## P2 — Escape silently discards the commit draft

Type a message in Commit, press Escape, reopen Commit: the input is empty (verified in browser). `CommitDialog.tsx:119` closes directly and its open effect at line 52 resets the message. Preserve the draft per repository until successful commit or explicit discard, or confirm before discarding nonempty text. Backdrop dismissal uses the same unguarded close path.

## Visual review and verification

- Inspected saved composited screenshots: selected graph node and details at 1280×800; commit failure dialog at 100%; settled commit dialog at 150%; dark commit dialog at 800×600. The selected node remains visible in the tested fixture. The 100% and narrow dark dialogs are readable.
- `npm run test:unit`: 82/82 passed, 11 files.
- `npm run test:resolution`: 19/20 passed. The remaining test timed out waiting for a third history row; this audit fixture has only one commit. That is a fixture limitation, not evidence of a zoom regression from that suite. The separate 150% modal probe above independently demonstrates the clipping. Suite was not rerun.
- Full e2e, visual baseline comparisons, native window controls, large-history performance, and Linux/WebKit were not audited here.
- Screenshots are under `website/public/assets/audit-ui-{normal,commit,zoom,narrow}.png`. The one-off probe was removed after verification.

## Environment note

Port 7733 already had engine 0.12.3 running, incompatible with the v0.13.16 session API. The audit used a freshly built current engine on 7734 and Vite's allowed CORS origin 1420. Existing engine was left alone. Windows sandbox-owned Git fixtures cannot be opened by an engine running as the owner without Git ownership handling; use the same Windows identity for fixture creation and engine in future audits.

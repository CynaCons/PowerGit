# Commit reliability — v0.13.17

## Implemented

CommitDialog sizes its zoomed paper in viewport coordinates; file actions wrap
as the available width decreases. Failed submissions show an alert and retain
the draft. A synchronous pending guard prevents duplicate commits and dismissal
during submission. Message-only amend permits a clean index after HEAD loads.
Drafts remain in memory per repository root and commit/amend mode, across
Escape, Cancel, backdrop dismissal and repository switching. Successful
submission clears only its draft. Refresh failures report that the commit
succeeded instead of inviting a duplicate retry.

Git Extensions reference: `src/app/GitUI/CommandsDialogs/FormCommit.cs`,
`OnFormClosed` stores normal/amend messages; the empty-index check permits
amend to change only a message or timestamp. PowerGit retains drafts only
for the current window lifetime in this iteration.

## Evidence and limits — 2026-09-05

- All four symptom regressions were run before product changes and failed
  at the observed symptoms: footer below 800px, absent rejection alert,
  disabled message-only Amend, erased Escape draft.
- Nine focused Playwright checks passed: 100/150/200% composited button
  pixels and reachability, rejection/retry, pending double-click, repository
  draft isolation, validation, real message-only amend, and dismissal/mode
  draft retention. Disposable repositories; no product-repository commits.
- Build/typecheck, lint and format passed before the final reviewed refresh
  timing adjustment. Final typecheck is recorded in the release handoff.
- Unit suite: 81/82 passed; graph's 10k layout performance budget measured
  597ms against 400ms while builds ran concurrently. No graph code changed.
- Full Windows e2e was started and stopped at owner request. It was not
  certified green. Ubuntu harness first hit Windows DLL locks; isolated
  build directories removed that obstacle, then an existing engine tree
  API test failed with HTTP 400 after 42 seconds. Linux/WebKit, native
  Windows, resolution and visual baseline acceptance remain unverified.
- Settled captures: `website/public/assets/commit-fixed-browser-*.png`.
  These are audit evidence from disposable repositories, not showcase art.

## Owner release override

The owner explicitly requested: "I don't want to waste all your tokens on
running e2e tests. Review and push ... We need to release this app."
Remaining local suites and manual owner verification were waived in favor
of code review and publishing. This does not turn incomplete checks into
passes. Existing GitHub CI and release packaging guards remain enabled.

## Scope

Product changes: `CommitDialog.tsx`, `dialogs/AppDialogs.tsx`,
`hooks/useGitActions.ts`. Regression suite: `commit-reliability.spec.ts`.
The release also includes the owner's eight previously uncommitted UI
files reviewed in this session: title-strip progress, rail menu keyboard
access and retargeting, consistent unavailable Merge label, WebKit blur,
and rail fallback. No release binaries are checked into Git.

# Frontend session state machine (v0.13.12)

## One discriminated union, one reducer
`src/session/state.ts`: `SessionPhase` = starting | demo | no-repository |
ready | busy | recovering | engine-failed. `sessionReducer` is the only
place transitions happen; `sessionView(phase)` derives the flags the chrome
reads (`live`, `offline`, `booting`, `busy`, `repo`, `health`, `statusText`,
`primaryAction`). The old booleans (`offline/live/health/repo/engineError`)
no longer exist as independent state, so "offline but live" cannot happen.
`state.test.ts` pins the legal transitions.

## Who drives it (`hooks/useEngineSession.ts`)
- boot/recovery loop: probes `/health` with backoff while the phase is
  starting/recovering (`MAX_RECOVERY_ATTEMPTS` = 5, then engine-failed);
- repository resolution: the `?repo=<id>` pin first, `/repos/current` only
  as fallback; `openRepo` pins the new id and closes the previous session;
- `handleFailure(e, ctx)`: transport failures (TypeError / "Failed to
  fetch" / timeouts) → `engine-lost` (recovery re-arms); 404 "unknown
  repository session" → `repo-unknown` (no-repository with a reason);
  anything else is a normal error message;
- Tauri events from lib.rs: `engine-exited { status, restarting }` and
  `engine-restarted { baseUrl }`; `engine_log_path` command feeds the
  recovery panel.

## Demo is explicit
`VITE_DEMO=1` (Pages build, `playwright.demo.config.ts`) or `?demo=1`.
Never inferred from a dead engine: that path shows the recovery states.

## UI surfaces
- `StatusBar` shows one phrase per phase (`data-phase` attribute:
  starting | live | no-repository | offline | demo), a polite live region,
  and the job progress as a button opening `JobPanel`.
- `HistoryPane` empty states are per phase (`grid-starting`, `grid-offline`,
  `grid-no-repo`, `grid-no-commits`, `grid-loading`, `grid-error`).
- `RecoveryPanel` (dialog): copy per phase, reason, last repo, engine log
  path, last diagnostics entries (`src/diagnostics.ts` ring buffer fed by
  transport failures, unhandled errors/rejections, sidecar exits), copy.
- Async surfaces share `AsyncState.tsx` (LoadingState / EmptyState /
  ErrorState); `BottomPanel` keeps the last diff/blob visible while a
  refresh runs, `refreshing` in the status bar marks background refreshes.
- Network ops: `PullPushPreview` (branch, upstream, ahead/behind, rebase or
  force-with-lease with typed confirmation); `JobPanel` lists this
  session's operations with elapsed, command, output, cancel, retry, copy;
  `gitErrors.ts` translates credential/SSH/network failures into a headline
  + hint.

## e2e
`session-states.spec.ts` (starting → live, engine lost → recovering →
back, evicted session, two pinned windows, previews), `jobs-contract.spec.ts`
(session-qualified job routes with no route stubs), `large-content.spec.ts`
(truncated blob/diff notice, virtualized rows).

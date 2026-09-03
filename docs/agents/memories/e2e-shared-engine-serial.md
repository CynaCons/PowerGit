# The e2e suite must run serially (one shared engine, one open repo)

Captured 2026-09-03 during v0.12.2.

## The bug this caused
`playwright.config.ts` used to set `fullyParallel: ci` / `workers: ci ? undefined : 1`.
Every spec talks to the SAME `PowerGit.Engine` process, which has exactly one
open repository, and `tests/e2e/live-refresh-scope.spec.ts` switches that
repository to a temp fixture and deletes it in `afterAll`. Under parallel
workers other specs then saw `no repository` (status bar), or a repo whose
directory had just been removed. Windows passed (1 worker, non-CI) while the
Linux container failed 3 webkit + 5 chromium tests — the difference was
`CI=1`, not the platform.

Config is now `fullyParallel: false`, `workers: 1` everywhere. The whole suite
is ~2-3 minutes serially. Do not "speed it up" by re-enabling parallelism
unless each worker gets its own engine on its own port.

## Corollary: a spec that mutates engine state is global
`POST /repos/open` is process-wide. If a spec must switch repositories it has
to restore the previous one in `afterAll` AND rely on serial execution.

## WebKit cannot read the clipboard in Playwright
`context.grantPermissions(["clipboard-read", ...])` throws on the webkit
project. Gate clipboard read-back on `test.info().project.name !== "webkit"`;
the copy click itself is still worth exercising because WebKitGTK may not
expose `navigator.clipboard` under `tauri://` at all (hence the
execCommand fallback in the Copy action).

## Tests must not assume `ListRevisions(1)[0]` is HEAD
Since v0.12.0 the revision stream is `--date-order` across all branches, so
the newest row can belong to another branch — and does whenever two commits
tie on commit date (same second, which is normal in tests). Use the repo's
real HEAD (`git rev-parse HEAD`, `TempRepo.HeadId()`) instead. Two engine
tests were relying on this: one failed outright, the other
(`CreateBranch_and_CreateTag_at_commit`) had been passing for the wrong
reason and never tested its own claim.

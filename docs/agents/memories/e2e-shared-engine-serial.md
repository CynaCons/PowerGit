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

## Restore the repo that WAS open, not the dev checkout (2026-09-03)

`live-refresh-scope.spec.ts` used to end with `openRepoOnEngine(process.cwd())`,
i.e. it assumed the engine had the dev checkout open before it borrowed it.
That is false wherever the harness deliberately opened something else. In the
Linux container the engine serves a seeded fixture repo, so this spec silently
switched every later spec onto a different repository mid-run.

The tell was a pair of results that could not both be true of the same code:
webkit 46/48 and chromium 48/48 in one container run. Webkit ran first (against
the fixture); chromium ran after the switch (against the real checkout), where
the two repo-specific assertions happened to hold. Now the spec records
`GET /repos/current` in `beforeAll` and restores that.

Corollary: a spec must never assert on content that exists only in one
repository (".gitignore contains 'visual studio'"). Discover a suitable file
from the tree and check it against the engine's own bytes instead.

## Two more "passing for the wrong reason" shapes seen the same day

- `expect(a.or(b))` where b CONTAINS a: once both render the locator matches
  two elements and strict mode fails. It passed only while the slower one had
  not appeared yet. Assert on the inner, meaningful element.
- Exact geometric containment of a MUI outlined `InputLabel`: it straddles its
  field's top border by design, so layout rounding leaves it ~1px outside at
  some dialog positions. Assert the visible fraction (>90%) — that still
  catches the real defect (a label cut in half) without flaking.

## Linux harness

The image's ENTRYPOINT is `check.sh`; running `webkit-check.sh` requires
`docker run --entrypoint bash ...`, otherwise the script path is passed to
`check.sh` as an ignored argument and the wrong suite runs with no warning.
The harness also builds/installs in `/tmp` copies: `npm ci` in the bind mount
installs Linux binaries over the Windows host's `frontend/node_modules`.

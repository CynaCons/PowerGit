# Engine repository sessions (v0.13.6)

## Contract
- `POST /repos/open {path}` returns `RepoInfo { name, root, branch, id }`.
  `id` = 12 hex chars of SHA-1(normalized root); opening the same root again
  returns the same session. `GET /repos` lists sessions, `DELETE /repos/{id}`
  closes one (disposes its watcher). `GET /repos/current` = last opened.
- Every per-repository route lives under `/repos/{id}/...` (`/revisions`,
  `/status`, `/commits/{sha}/...`, `/stage`, `/fetch`, `/jobs/{job}`,
  `/events`, …). Unknown id → 404 from the group's endpoint filter, before
  the handler runs.
- `RepoRegistry` (singleton) owns one `GitHost` per session; `GitHost` keeps
  root, FileSystemWatcher, job table and a one-slot write gate. Handlers get
  their `GitHost` from a scoped DI factory that reads the `{repo}` route
  value once, so no git command reads shared mutable state mid-request.
- Write gate: the group filter wraps every non-GET request in
  `GitHost.Mutate`; `/fetch`, `/pull`, `/push` are excluded because
  `StartJob` takes the gate itself for the job's lifetime. A collision
  answers **409** `{ error, running }` (never queues). Reads bypass the gate
  (GIT_OPTIONAL_LOCKS=0).
- Frontend (v0.13.12): `src/engine/client.ts` is an immutable
  `EngineClient { baseUrl, token, repoId }`; `withRepo(id)` returns a new
  one, nothing is module-global. Components take the window's client from
  `useEngine()`; hooks receive it explicitly. `?repo=<id>` pins a window
  to a session (`pinnedRepoId` / `rememberPinnedRepo` in bootstrap.ts);
  `/repos/current` is only consulted when no pin exists. Specs use
  `repoBase()` from `tests/engine.ts`.
- Lifecycle (v0.13.11): the group filter `Touch()`es the session on every
  request; a background timer evicts sessions idle for
  `POWERGIT_SESSION_IDLE_MINUTES` (default 30, 0 disables), never the last
  opened one nor one with a running job / held gate. `GET /repos/sessions`
  lists `{ id, name, root, branch, lastUsed, busy, watchers }`. The UI
  closes the previous session after opening another (best effort). Two
  narrow watchers per session (git dir top level + `refs/` recursive), 0
  after `Close()` (`GitHost.ActiveWatchers`).
- Jobs (v0.13.10/12): `POST /fetch|/pull|/push` answer 202 with
  `Location: /repos/{id}/jobs/{job}`; `POST /jobs/{job}/cancel` kills the
  git process tree (job ends `failed` with `cancelled: true`). `GitJobDto`
  carries `command`, `startedAt`, `finishedAt`, `cancelled`.

## Landmines
- Route parameter names must not repeat inside a group: the group is
  `/repos/{repo}` because `/commits/{id}` already uses `{id}`.
- Minimal-API parameter binding (incl. DI) runs BEFORE endpoint filters, so
  the scoped `GitHost` factory must not throw for an unknown id; it returns
  the repo-less `RepoRegistry.Tool` and the filter answers 404.
- `EngineAuth` matches `/events` by suffix now; an exact-path check silently
  401s the SSE stream once it moved under the group.
- Handlers in the group are synchronous, so `Mutate(() => next(ctx).GetAwaiter().GetResult())`
  is safe; an async handler under the gate would deadlock-risk — keep new
  mutating handlers sync or take the gate inside the handler instead.

## Why e2e is still serial
Specs that open a temp repo still change the engine-global `/repos/current`
that a booting spec without a `?repo=` pin resolves. The UI can be pinned
now (v0.13.12, `session-states.spec.ts` proves two pages stay isolated), so
parallel e2e is a matter of giving every spec its own pinned repo; until
then the suite stays serial (Vite 1420 is strictPort anyway).

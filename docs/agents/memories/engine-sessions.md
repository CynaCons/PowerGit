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
- Frontend: `engine.ts` remembers `REPO_ID` from `openRepo` / `fetchCurrent`
  and prefixes every helper via `repoBase()`; `engineEventsUrl()` rejects
  when no repo is open. Specs use `repoBase()` from `tests/engine.ts`.

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
The engine is now concurrency-safe, but the UI boots from `/repos/current`
(the LAST opened repo, engine-global). A spec that opens a temp repo changes
what a concurrently booting spec sees. Parallel e2e needs the UI to pin its
repo (e.g. `?repo=<id>` or per-context storage) — tracked in the backlog.

# Engine port contract (v0.12.0; reuse removed in v0.13.0)

> v0.13.0: the reuse path, `probe_health`, `looks_like_powergit_health` and
> `dechunk` were deleted from `lib.rs`. A foreign engine cannot know this
> launch's auth token (see engine-token.md), so the shell now only asks "is
> 7733 free?" (bind probe) and otherwise spawns on an OS-assigned port. The
> history below is kept for the chunked-`/health` landmine, which still
> applies to anything that hand-parses Kestrel responses.

## The bug
`frontend/src-tauri/src/lib.rs` used to spawn `powergit-engine` unconditionally
on `http://127.0.0.1:7733` and drop the `CommandChild` handle. A leftover
engine from a previous run (or a crash) kept the port, so the next launch
crashed with `IOException: Failed to bind to address ... address already in
use`, and the sidecar was never killed on quit anyway (zombie engine).

## The fix: probe, reuse, or fall back — never just fail
In `setup()`, `resolve_engine_port()` runs synchronously (plain
`TcpStream::connect_timeout` + a hand-rolled `GET /health`, ~300ms budget;
no new crates — `serde_json` + `std::net` already sufficed) **before** the
webview can execute any frontend JS:
- Nothing answers on 7733 → free, spawn there (unchanged fast path).
- Something answers `GET /health` with `{"status":"ok","engine":"...",...}`
  (the real `HealthResponse` shape from `GitHost.cs`) → it's our engine,
  **reuse it, do not spawn**, and do not track/kill it on exit (it wasn't
  ours to begin with — could be a `dev:all`-managed process).
- Something answers but not with that shape → a stranger owns the port;
  bind `TcpListener` on `127.0.0.1:0` to get an OS-assigned free port, then
  drop the listener and spawn the sidecar there instead (tiny accepted
  TOCTOU race between the drop and the sidecar's own bind).

The resolved base URL and (only when we actually spawned) the
`CommandChild` live in managed `EngineState`. `run()`'s callback kills the
child on `RunEvent::Exit | RunEvent::ExitRequested` so quitting the app
never leaves a zombie engine.

## Frontend side: `engine_base_url` command, awaited everywhere
`engine.ts` exposes `ENGINE_URL` as `let` (was `const`) and resolves it once
via a module-load-time `engineReady` promise that calls
`invoke<string>("engine_base_url")` — but only when `isTauri()`-equivalent
(`"__TAURI_INTERNALS__" in window`) is true and `VITE_ENGINE_URL` is unset,
so Vite dev / the Pages demo are untouched. Every exported request function
does `await engineReady` as its first line before building the URL, so none
of them can race ahead of the port decision — there is no other worker
(main.tsx/App.tsx) that awaits this; engine.ts guarantees it internally.

## Landmine: `/health` is chunked, not Content-Length
Kestrel answers `GET /health` with `Transfer-Encoding: chunked` and **no**
`Content-Length` (verified 2026-09-02 with a raw `TcpClient` against a real
`dotnet run` instance — a minimal-API `Results.Ok(...)` JSON write isn't
buffered enough for Kestrel to know the length up front on this endpoint).
A naive probe that reads the socket and hands everything after the header
blank line straight to a JSON parser gets `"87\r\n{...}\r\n0\r\n\r\n"`
instead of clean JSON and always fails to parse — so a hand-rolled
dependency-free HTTP probe (as used here, since pulling in `reqwest`/`hyper`
for one health check isn't worth it) **must** de-chunk the body first: strip
each `<hex-size>\r\n<data>\r\n` segment until the `0\r\n\r\n` terminator.
Getting this wrong doesn't crash anything — it just makes the probe always
report "not our engine", so a healthy engine is never reused and a fallback
port is spawned needlessly on every single launch. Silent-degradation bugs
like this are easy to miss without an actual raw-socket test; `curl -v` also
hides it because curl de-chunks transparently before printing the body.

## Coordination note
On 2026-09-02 this exact engine.ts change (same `engineReady` design, same
`engine_base_url` command name) was already present in the shared working
tree, done by a concurrent/duplicate "port" worker, before the `lib.rs` side
was written. It was verified compatible as-is (same command name/contract)
and left untouched rather than redone. That same worker also patched
`lib.rs`'s `looks_like_powergit_health` (see previous heading) concurrently
while this session was mid-flight — the file was re-read and re-verified
(`cargo check` + a raw-socket byte trace) rather than overwritten. If you
find engine.ts already patched like this, check `lib.rs` for the matching
Rust half before assuming the task is incomplete, and re-`view` files you
don't currently have open before editing — shared-checkout concurrent edits
are real here, not just a theoretical warning.

## Landmine: top-level `await` in engine.ts breaks the Vite build
Before landing the `engineReady`-promise design above, a top-level
`await invoke(...)` in `engine.ts` (so every importer would block until
resolved, no per-call guard needed) looked simpler. Don't: `vite.config.ts`
has no `build.target` override, so Vite/esbuild uses the default `'modules'`
target (`es2020`/`safari14`/etc.), and esbuild **refuses to build** any
top-level await against that target — confirmed directly by running the
installed `node_modules/.bin/esbuild` against a one-line repro
(`export const x = await Promise.resolve(1)`, `--target=es2020`):
`Top-level await is not available in the configured target environment`.
This breaks `npm run build` for both the Tauri packaging path and the
GitHub Pages demo (same `frontend/` build). Bumping `build.target` to
`es2022`/`esnext` would fix it but is out of scope for a targeted port-
collision fix and wasn't attempted — the per-call `await engineReady` guard
needs no build config changes at all.

## Tauri v2 ACL: app commands need no capability entry
`engine_base_url` is a plain `#[tauri::command]` defined in the app's own
`lib.rs`, not a plugin — Tauri v2's ACL/capabilities system only gates
plugin-namespaced commands (`plugin:shell|execute`, `dialog:default`, etc.)
by default. App commands registered via
`invoke_handler(tauri::generate_handler![...])` are callable from
`invoke()` immediately, no `capabilities/*.json` entry needed. Don't add
one preemptively; it's a no-op at best and misleading at worst (looks like
it's required when it isn't).

# Engine auth token (v0.13.0)

## Why
The engine is a Kestrel server on 127.0.0.1 that runs git with the user's
credentials. "Localhost only" is not a boundary: any web page in any browser
can `fetch("http://127.0.0.1:7733/reset")`. Before v0.13.0 CORS was
AllowAnyOrigin and nothing identified the caller.

## Contract
- Every route except `GET /health` and CORS preflights requires
  `Authorization: Bearer <token>` (`src/engine/PowerGit.Engine/EngineAuth.cs`,
  constant-time compare). `/events` is an EventSource and takes `?token=`.
- Token source, in order: env `POWERGIT_ENGINE_TOKEN`, CLI `--token`, else a
  random one printed to stderr (so a bare `dotnet run` is never silently open).
- CORS is a fixed origin list (tauri://localhost, http(s)://tauri.localhost,
  127.0.0.1:1420, localhost:1420) plus `POWERGIT_ENGINE_ORIGINS` (comma list).

## Who knows the token
- Packaged app: `lib.rs` generates 32 random bytes per launch, passes them to
  the sidecar via env, and the webview asks for them with the `engine_config`
  command (replaced `engine_base_url`). Engine reuse across launches is gone
  (a foreign engine cannot know this launch's token); the sidecar always
  spawns, on 7733 or a free port.
- Dev: `frontend/.engine-token` (gitignored). `scripts/engine.ps1` and
  `vite.config.ts` both read-or-create it, so `npm run dev:all` just works.
  A standalone `dotnet run` needs `POWERGIT_ENGINE_TOKEN` set to that file's
  content or the UI gets 401 on everything.
- Specs and scripts: `frontend/tests/engine.ts` exports `ENGINE_URL` and
  `engineHeaders()`; never hardcode 7733 or call fetch without them.
- Preview builds (Docker harness): set `VITE_ENGINE_TOKEN` at build time and
  `POWERGIT_ENGINE_TOKEN` on the engine to the same value.

## Landmine
`frontend/src/engine.ts` routes every call through `engineFetch`. A new
endpoint helper that calls `fetch` directly will work in dev with the old
engine on your machine and fail with 401 in the packaged app.

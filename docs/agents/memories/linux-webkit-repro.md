# Linux / WebKit repro harness (v0.12.1)

## Run the e2e suite under Playwright WebKit on Linux without a Linux box
`docker/ubuntu-check/webkit-check.sh` builds the engine from a COPY of
`src/engine` (building in the bind mount fails: Windows holds
`bin/Debug/*.dll`), seeds `/tmp/seed` on branch `powergit` with a nested
`frontend/src` tree and two authors, probes `/tree?path=`, `/blob?path=`
and `/revisions`, then runs `npx playwright test --project=webkit` and
chromium against `vite preview`. Launch from Windows:

```
docker run -d --name pglinux -v "C:/dev/public-repo/powergit:/repo" \
  -v powergit-frontend-modules:/repo/frontend/node_modules \
  --entrypoint bash powergit-ubuntu-check \
  -c "tr -d '\r' < /repo/docker/ubuntu-check/webkit-check.sh > /tmp/lc.sh && bash /tmp/lc.sh"
docker wait pglinux; docker logs pglinux
```
Use `MSYS_NO_PATHCONV=1` in git-bash and Windows-style `C:/...` mount paths.
Result 2026-09-02: 25/25 webkit + 25/25 chromium, engine tree/blob fine on
Linux git 2.43. So "File Tree cannot expand on Ubuntu" is not engine logic.

## `PW_WEBKIT=1` adds a webkit project on Windows too
`playwright.config.ts` gates a `webkit` project behind `PW_WEBKIT=1`
(`npx playwright install webkit` once). Hotkeys, overlay, File Tree all
pass there; WebKit-project failures seen only while Copilot workers were
editing files were HMR noise, not bugs.

## Reuse of a stale engine was a real trap
v0.12.0 reused ANY healthy engine on :7733. `lib.rs` now reuses only when
`/health` `engine` equals `CARGO_PKG_VERSION`; otherwise it spawns its own
sidecar on a free port. Tell the owner to `pkill -f powergit-engine` once
before testing a new AppImage anyway.

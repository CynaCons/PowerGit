#!/usr/bin/env bash
# Runs inside the ubuntu-check container against the mounted repo at /repo.
# E2e runs against the PRODUCTION BUILD (vite preview), not the dev server:
# Vite's per-request transforms hang on Docker Desktop bind mounts.
set -euo pipefail

cd /repo
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_NOLOGO=1
# Engine auth (EngineAuth.cs): one token for the engine, the built UI and curl.
export POWERGIT_ENGINE_TOKEN=ubuntu-check-token VITE_ENGINE_TOKEN=ubuntu-check-token
AUTH=(-H "Authorization: Bearer $POWERGIT_ENGINE_TOKEN")

echo "== engine tests =="
dotnet test src/engine/PowerGit.Engine.sln

echo "== frontend install =="
cd frontend
npm ci

echo "== playwright chromium =="
npx playwright install chromium

echo "== build frontend =="
npx tsc -b --force
npx vite build

echo "== start engine =="
dotnet run --project ../src/engine/PowerGit.Engine --urls http://127.0.0.1:7733 &> /tmp/engine.log &
ENGINE_PID=$!
for i in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:7733/health >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! curl -fsS http://127.0.0.1:7733/health; then
  echo "engine failed to start:"
  tail -30 /tmp/engine.log
  exit 1
fi
echo

# Point the engine at a small deterministic repo — walking the huge mounted
# worktree through Docker Desktop's slow bind mount makes /revisions crawl.
# The shape (branch powergit, frontend/src tree, README, two authors,
# feature branch) is shared with webkit-check.sh via seed-repo.sh; the e2e
# specs (blob-highlight, file-tree) click the `powergit` tree row and expect
# frontend/src/graph/layout.ts at HEAD.
echo "== seed repository =="
tr -d '\r' < /repo/docker/ubuntu-check/seed-repo.sh > /tmp/seed-repo.sh
# shellcheck source=docker/ubuntu-check/seed-repo.sh
. /tmp/seed-repo.sh
seed_repo /tmp/seed /repo
curl -sf -X POST http://127.0.0.1:7733/repos/open "${AUTH[@]}" \
  -H 'Content-Type: application/json' \
  -d '{"path":"/tmp/seed"}' > /dev/null
cd /repo/frontend

echo "== serve production build =="
npx vite preview --port 1420 --strictPort &> /tmp/preview.log &
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:1420/ >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:1420/ >/dev/null || { echo "preview server failed:"; tail -20 /tmp/preview.log; exit 1; }

# Specs that talk to the engine directly (tests/engine.ts) read
# POWERGIT_ENGINE_URL; keep it explicit so a port override in the container
# never silently points them at nothing.
export POWERGIT_ENGINE_URL=http://127.0.0.1:7733

# The gate: EVERY functional spec, no retries, stop at the first failure so
# the log shows the one real error instead of cascaded fallout. Without
# --retries=0/--max-failures=1 a CI=1 environment would run maxFailures: 0
# (all specs, all failures) and the summary buries the first cause.
echo "== e2e (all specs, retries 0, max-failures 1) =="
npx playwright test --config playwright.config.ts --retries=0 --max-failures=1
npx playwright test --config playwright.resolution.config.ts --retries=0 --max-failures=1

kill $ENGINE_PID 2>/dev/null || true
echo "== ubuntu check passed =="

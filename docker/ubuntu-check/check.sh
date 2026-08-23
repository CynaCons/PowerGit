#!/usr/bin/env bash
# Runs inside the ubuntu-check container against the mounted repo at /repo.
# E2e runs against the PRODUCTION BUILD (vite preview), not the dev server:
# Vite's per-request transforms hang on Docker Desktop bind mounts.
set -euo pipefail

cd /repo
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_NOLOGO=1

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
echo "== seed repository =="
rm -rf /tmp/seed
mkdir /tmp/seed
cd /tmp/seed
git init -b main -q
echo "# Seed repo" > README.md
git add .
git commit -qm "initial commit"
echo "feature line" > feature.txt
git add .
git commit -qm "add feature.txt"
echo "second line" >> feature.txt
git add .
git commit -qm "extend feature.txt"
git tag v1.0.0
for i in $(seq 1 30); do
  echo "line $i" >> log.txt
  git add .
  git commit -qm "work item $i"
done
git branch feature/2
curl -sf -X POST http://127.0.0.1:7733/repos/open \
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

echo "== e2e =="
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.resolution.config.ts

kill $ENGINE_PID 2>/dev/null || true
echo "== ubuntu check passed =="

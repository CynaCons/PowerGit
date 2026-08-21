#!/usr/bin/env bash
# Runs inside the ubuntu-check container against the mounted repo at /repo.
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

echo "== start engine =="
dotnet run --project ../src/engine/PowerGit.Engine --urls http://127.0.0.1:7733 &
ENGINE_PID=$!
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:7733/health >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:7733/health
echo

echo "== e2e =="
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.resolution.config.ts

kill $ENGINE_PID 2>/dev/null || true
echo "== ubuntu check passed =="

#!/usr/bin/env bash
# Linux repro for owner-reported WebKitGTK/Linux defects. Runs inside the
# powergit-ubuntu-check image with the repo mounted at /repo.
set -uo pipefail
cd /repo
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
# Engine auth (EngineAuth.cs): one token for the engine, the built UI and curl.
export POWERGIT_ENGINE_TOKEN=ubuntu-check-token VITE_ENGINE_TOKEN=ubuntu-check-token
AUTH=(-H "Authorization: Bearer $POWERGIT_ENGINE_TOKEN")
export GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=user.email GIT_CONFIG_VALUE_0=ci@powergit.local GIT_CONFIG_KEY_1=user.name GIT_CONFIG_VALUE_1="PowerGit CI"

echo "== git: $(git --version)"

echo "== start engine =="
rm -rf /tmp/engsrc && mkdir -p /tmp/engsrc && cp -r src/engine /tmp/engsrc/ && rm -rf /tmp/engsrc/engine/*/bin /tmp/engsrc/engine/*/obj && cp global.json Directory.Packages.props /tmp/engsrc/ 2>/dev/null; cp Directory.Build.props /tmp/engsrc/ 2>/dev/null; sed -i "s#/tmp/engsrc/engine#/tmp/engsrc/engine#" /dev/null
dotnet run --project /tmp/engsrc/engine/PowerGit.Engine --urls http://127.0.0.1:7733 &> /tmp/engine.log &
ENGINE_PID=$!
for i in $(seq 1 180); do curl -fsS http://127.0.0.1:7733/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:7733/health || { echo "engine failed"; tail -30 /tmp/engine.log; exit 1; }
echo

echo "== seed repo (branch powergit, nested dirs, two authors) =="
# Same fixture as check.sh: docker/ubuntu-check/seed-repo.sh.
tr -d '\r' < /repo/docker/ubuntu-check/seed-repo.sh > /tmp/seed-repo.sh
# shellcheck source=docker/ubuntu-check/seed-repo.sh
. /tmp/seed-repo.sh
seed_repo /tmp/seed /repo
cd /repo

SID=$(curl -sf -X POST http://127.0.0.1:7733/repos/open "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"path":"/tmp/seed"}' | grep -o '"id":"[a-f0-9]*"' | cut -d'"' -f4); echo "session $SID"
H=$(git -C /tmp/seed rev-parse HEAD)
echo "== tree root =="; curl -s "${AUTH[@]}" "http://127.0.0.1:7733/repos/$SID/commits/$H/tree" | head -c 300; echo
echo "== tree frontend =="; curl -s "${AUTH[@]}" "http://127.0.0.1:7733/repos/$SID/commits/$H/tree?path=frontend" | head -c 300; echo
echo "== tree frontend/src =="; curl -s "${AUTH[@]}" "http://127.0.0.1:7733/repos/$SID/commits/$H/tree?path=frontend%2Fsrc" | head -c 300; echo
echo "== tree frontend/src/components =="; curl -s "${AUTH[@]}" "http://127.0.0.1:7733/repos/$SID/commits/$H/tree?path=frontend%2Fsrc%2Fcomponents" | head -c 300; echo
echo "== blob =="; curl -s "${AUTH[@]}" "http://127.0.0.1:7733/repos/$SID/commits/$H/blob?path=frontend%2Fsrc%2Fcomponents%2FDiffView.tsx" | head -c 200; echo
echo "== revisions (first 6 subjects) =="; curl -s "${AUTH[@]}" "http://127.0.0.1:7733/repos/$SID/revisions?max=6" | grep -o '"subject":"[^"]*"' | head -6
echo "== engine log tail =="; tail -5 /tmp/engine.log

# Work on a COPY, never in the bind mount. `npm ci` here used to install
# Linux binaries straight over the Windows host's frontend/node_modules,
# leaving the host checkout with a broken toolchain after every Linux run
# (npx tsc: "'tsc' is not recognized"). Same reason the engine is built from
# /tmp/engsrc rather than in place.
rm -rf /tmp/fe && mkdir -p /tmp/fe
tar -C /repo/frontend --exclude=node_modules --exclude=dist --exclude=test-results     --exclude=playwright-report -cf - . | tar -C /tmp/fe -xf -
cd /tmp/fe
echo "== npm ci =="; npm ci --no-audit --no-fund 2>&1 | tail -2
echo "== playwright browsers =="; npx playwright install --with-deps chromium webkit 2>&1 | tail -3
echo "== build =="; npx vite build 2>&1 | tail -3
ls dist/fonts 2>/dev/null || echo "NO dist/fonts"
grep -o 'fonts/[a-z-]*\.woff2' dist/assets/*.css | head -2

npx vite preview --port 1420 --strictPort &> /tmp/preview.log &
for i in $(seq 1 60); do curl -fsS http://127.0.0.1:1420/ >/dev/null 2>&1 && break; sleep 1; done

echo "== e2e webkit =="
PW_WEBKIT=1 npx playwright test --project=webkit --max-failures=50 --reporter=line 2>&1 | tail -40
echo "== e2e chromium =="
npx playwright test --project=chromium --max-failures=50 --reporter=line 2>&1 | tail -15

kill $ENGINE_PID 2>/dev/null || true
echo "== linux check done =="

#!/usr/bin/env bash
# Linux variant of build-engine-sidecar.ps1: publishes the engine as a
# self-contained single-file binary named for the Tauri sidecar convention.
set -euo pipefail

TARGET="${1:-x86_64-unknown-linux-gnu}"
repo="$(cd "$(dirname "$0")/.." && pwd)"

dotnet publish "$repo/src/engine/PowerGit.Engine/PowerGit.Engine.csproj" \
    -c Release -r linux-x64 \
    --self-contained true \
    -p:PublishSingleFile=true \
    -p:IncludeNativeLibrariesForSelfExtract=true \
    -o "$repo/src/engine/PowerGit.Engine/bin/publish"

mkdir -p "$repo/frontend/src-tauri/binaries"
cp "$repo/src/engine/PowerGit.Engine/bin/publish/PowerGit.Engine" \
   "$repo/frontend/src-tauri/binaries/powergit-engine-$TARGET"
chmod +x "$repo/frontend/src-tauri/binaries/powergit-engine-$TARGET"
echo "sidecar ready: frontend/src-tauri/binaries/powergit-engine-$TARGET"

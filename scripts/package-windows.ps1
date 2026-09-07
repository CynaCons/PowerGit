# Packages Windows release artifacts.
# - portable zip: powergit.exe + engine sidecar, self-sufficient
# - NSIS installer is produced by `tauri build` and copied alongside
#
# Usage: pwsh scripts/package-windows.ps1 [-SkipBuild]
param(
    [switch]$SkipBuild
)
$ErrorActionPreference = "Stop"

$repo = (Resolve-Path "$PSScriptRoot\..").Path
$frontend = Join-Path $repo "frontend"
# Single version source (v0.13.5): frontend/package.json. tauri.conf.json only points at it.
$version = (Get-Content "$frontend\package.json" -Raw | ConvertFrom-Json).version

if (-not $SkipBuild) {
    pwsh -NoProfile -File "$repo\scripts\build-engine-sidecar.ps1"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Push-Location $frontend
    npm ci
    $code = $LASTEXITCODE
    if ($code -ne 0) { Pop-Location; exit $code }
    # v0.14.0: CI sets POWERGIT_SIGN=1 (with the TAURI_SIGNING_* secrets) so the
    # installer gets its updater signature; local runs stay unsigned and never
    # need the private key. The override lives in a file because a JSON
    # --config argument does not survive npm on Windows intact.
    if ($env:POWERGIT_SIGN -eq "1") {
      npm run tauri build -- --config tauri.updater.conf.json
    } else {
      npm run tauri build
    }
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { exit $code }
}

$release = Join-Path $frontend "src-tauri\target\release"
$stage = Join-Path $env:TEMP "powergit-package"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item (Join-Path $release "powergit.exe") $stage
Copy-Item (Join-Path $release "powergit-engine*.exe") $stage

$dist = Join-Path $repo "dist"
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$zip = Join-Path $dist "PowerGit_${version}_win64.zip"
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -Force

Copy-Item (Join-Path $release "bundle\nsis\PowerGit_${version}_x64-setup.exe") $dist -Force

Write-Host ""
Write-Host "artifacts:"
Get-ChildItem $dist | ForEach-Object { Write-Host ("  {0}  ({1:N0} KB)" -f $_.Name, ($_.Length / 1KB)) }

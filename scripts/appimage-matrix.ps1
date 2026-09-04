# Runs the AppImage compatibility matrix (docker/appimage-check/run-matrix.sh)
# from Windows: launches one AppImage in stock ubuntu:22.04/24.04/26.04
# containers under xvfb and fails on any runtime dependency error.
# Requires Docker Desktop and Git Bash.
#
#   pwsh scripts/appimage-matrix.ps1 <file.AppImage> [-Out <dir>]
#        [-Versions "22.04 24.04 26.04"] [-Longevity <minutes>]
#        [-SmokeSeconds 20] [-RssBudgetMb 1500]
param(
  [Parameter(Mandatory = $true, Position = 0)][string]$AppImage,
  [string]$Out = "",
  [string]$Versions = "22.04 24.04 26.04",
  [int]$Longevity = 0,
  [int]$SmokeSeconds = 20,
  [int]$RssBudgetMb = 1500
)
$ErrorActionPreference = "Stop"

$repo = (Resolve-Path "$PSScriptRoot\..").Path
$git = Get-Command git.exe -ErrorAction SilentlyContinue
$gitBash = if ($git) { Join-Path (Split-Path (Split-Path $git.Source -Parent) -Parent) "bin\bash.exe" }
$bash = @(
  $gitBash
  "$env:ProgramFiles\Git\bin\bash.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $bash) { throw "Git Bash not found; install Git for Windows." }

$app = (Resolve-Path $AppImage).Path -replace '\\', '/'
if ($Out -eq "") { $Out = Join-Path $repo "docker\appimage-check\out" }
New-Item -ItemType Directory -Force $Out | Out-Null
$outPosix = (Resolve-Path $Out).Path -replace '\\', '/'
$script = (Join-Path $repo "docker\appimage-check\run-matrix.sh") -replace '\\', '/'

$env:MSYS_NO_PATHCONV = "1"
$env:SMOKE_SECONDS = "$SmokeSeconds"
$env:RSS_BUDGET_MB = "$RssBudgetMb"

$args = @($script, $app, "--out", $outPosix, "--versions", $Versions)
if ($Longevity -gt 0) { $args += @("--longevity", "$Longevity") }
& $bash @args
exit $LASTEXITCODE

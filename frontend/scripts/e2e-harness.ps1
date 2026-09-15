# Private e2e harness for one checkout (a worker worktree): its own engine on
# its own port, token and data dir, so two workers never share :7733 / :1420.
# Pair it with PW_PORT (playwright.config.ts); docs/agents/memories/private-e2e-harness.md.
#   pwsh frontend/scripts/e2e-harness.ps1 -Root C:\dev\public-repo\pg-wt-refs -Name refs -UiPort 1441 -EnginePort 7741
#   pwsh frontend/scripts/e2e-harness.ps1 -Root ... -Name refs -Stop
param(
  [Parameter(Mandatory)][string]$Root,
  [Parameter(Mandatory)][string]$Name,
  [int]$UiPort = 1441,
  [int]$EnginePort = 7741,
  [switch]$Stop
)
$ErrorActionPreference = "Stop"
$state = Join-Path $env:TEMP "pg-harness-$Name"
New-Item -ItemType Directory -Force $state | Out-Null
$pidFile = Join-Path $state "engine.pid"

if ($Stop) {
  if (Test-Path $pidFile) {
    $id = [int](Get-Content $pidFile -Raw).Trim()
    try { Stop-Process -Id $id -Force -ErrorAction Stop; Write-Host "stopped engine pid $id" } catch { Write-Host "engine pid $id already gone" }
    Remove-Item $pidFile -Force
  } else { Write-Host "no engine pid recorded for $Name" }
  exit 0
}

$tokenFile = Join-Path $Root "frontend\.engine-token"
if (-not (Test-Path $tokenFile)) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  [System.IO.File]::WriteAllText($tokenFile, (($bytes | ForEach-Object { $_.ToString("x2") }) -join "") + "`n")
}
$token = (Get-Content $tokenFile -Raw).Trim()

if (Test-Path $pidFile) {
  $old = [int](Get-Content $pidFile -Raw).Trim()
  if (Get-Process -Id $old -ErrorAction SilentlyContinue) { Write-Host "engine already running as pid $old (stop it first with -Stop to restart after an engine change)" }
  else { Remove-Item $pidFile -Force }
}
if (-not (Test-Path $pidFile)) {
  $dotnet = Join-Path $env:LOCALAPPDATA "Microsoft\dotnet\dotnet.exe"
  if (-not (Test-Path $dotnet)) { $dotnet = "dotnet" }
  $env:POWERGIT_ENGINE_TOKEN = $token
  $env:POWERGIT_DATA_DIR = Join-Path $state "data"
  $env:POWERGIT_ENGINE_ORIGINS = "http://127.0.0.1:$UiPort,http://localhost:$UiPort"
  $env:DOTNET_ROOT = Join-Path $env:LOCALAPPDATA "Microsoft\dotnet"
  $project = Join-Path $Root "src\engine\PowerGit.Engine\PowerGit.Engine.csproj"
  $p = Start-Process -FilePath $dotnet -ArgumentList @("run", "--project", $project, "--urls", "http://127.0.0.1:$EnginePort") `
    -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $state "engine.out.log") -RedirectStandardError (Join-Path $state "engine.err.log")
  Set-Content $pidFile $p.Id
  Write-Host "engine starting as pid $($p.Id) on http://127.0.0.1:$EnginePort (logs in $state)"
  $deadline = (Get-Date).AddSeconds(120)
  do {
    Start-Sleep -Seconds 2
    try { $h = Invoke-RestMethod "http://127.0.0.1:$EnginePort/health" -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 3; break } catch { $h = $null }
  } while ((Get-Date) -lt $deadline)
  if ($h) { Write-Host "engine healthy: $($h.engine) git $($h.gitVersion)" } else { Write-Host "engine did not answer /health within 120 s; read $state\engine.err.log"; exit 1 }
}

# Open the worktree as the engine's current repository.
Invoke-RestMethod -Method Post "http://127.0.0.1:$EnginePort/repos/open" -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } -Body (@{ path = $Root } | ConvertTo-Json) | Out-Null
Write-Host ""
Write-Host "Run Playwright from $Root\frontend with these set in the SAME shell:"
Write-Host "  `$env:PW_PORT = '$UiPort'; `$env:VITE_ENGINE_URL = 'http://127.0.0.1:$EnginePort'; `$env:POWERGIT_ENGINE_URL = 'http://127.0.0.1:$EnginePort'"
Write-Host "  npx playwright test tests/e2e/<spec>.spec.ts"

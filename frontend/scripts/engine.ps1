$ErrorActionPreference = "Stop"
$local = Join-Path $env:LOCALAPPDATA "Microsoft\dotnet\dotnet.exe"
$dotnet = if (Test-Path $local) { $local } else { "dotnet" }
$project = Join-Path $PSScriptRoot "..\..\src\engine\PowerGit.Engine\PowerGit.Engine.csproj"
# Shared dev secret (frontend/.engine-token, gitignored). vite.config.ts reads
# or creates the same file, so UI and engine agree without a known constant.
$tokenFile = Join-Path $PSScriptRoot "..\.engine-token"
if (-not $env:POWERGIT_ENGINE_TOKEN) {
  if (-not (Test-Path $tokenFile)) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    [System.IO.File]::WriteAllText($tokenFile, (($bytes | ForEach-Object { $_.ToString("x2") }) -join "") + "`n")
  }
  $env:POWERGIT_ENGINE_TOKEN = (Get-Content $tokenFile -Raw).Trim()
}
& $dotnet run --project $project --urls "http://127.0.0.1:7733"

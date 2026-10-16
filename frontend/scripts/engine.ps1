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
# Own data directory (recents.json) so the dev engine and the e2e fixtures
# it opens never show up in the packaged app's "Recent repositories"
# (v0.13.21 owner report). POWERGIT_DATA_DIR wins if already set.
if (-not $env:POWERGIT_DATA_DIR) {
  $env:POWERGIT_DATA_DIR = Join-Path ([System.IO.Path]::GetTempPath()) "powergit-dev-data"
}
# The same for PowerChannel (v0.21.2): agent reviews post on the channel, and
# the e2e fixtures must not land on the user's real one. A spec that needs a
# board creates this file. POWERCHANNEL_DB wins if already set (the legacy
# POWERBOARD_DB also counts).
if (-not $env:POWERCHANNEL_DB -and -not $env:POWERBOARD_DB) {
  $env:POWERCHANNEL_DB = Join-Path $env:POWERGIT_DATA_DIR "board.db"
}
& $dotnet run --project $project --urls "http://127.0.0.1:7733"

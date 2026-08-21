# Publishes PowerGit.Engine as a self-contained single-file exe and places it
# where the Tauri sidecar mechanism expects it (src-tauri/binaries with the
# rust target-triple suffix).
param(
    [string]$Target = "x86_64-pc-windows-msvc"
)
$ErrorActionPreference = "Stop"

$dotnet = "$env:LOCALAPPDATA\Microsoft\dotnet\dotnet.exe"
if (-not (Test-Path $dotnet)) { $dotnet = "dotnet" }

$repo = (Resolve-Path "$PSScriptRoot\..").Path
$out = Join-Path $repo "src\engine\PowerGit.Engine\bin\publish"

& $dotnet publish "$repo\src\engine\PowerGit.Engine\PowerGit.Engine.csproj" `
    -c Release -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -o $out
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$binDir = Join-Path $repo "frontend\src-tauri\binaries"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
Copy-Item (Join-Path $out "PowerGit.Engine.exe") (Join-Path $binDir "powergit-engine-$Target.exe") -Force
Write-Host "sidecar ready: frontend\src-tauri\binaries\powergit-engine-$Target.exe"

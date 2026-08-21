$ErrorActionPreference = "Stop"
$local = Join-Path $env:LOCALAPPDATA "Microsoft\dotnet\dotnet.exe"
$dotnet = if (Test-Path $local) { $local } else { "dotnet" }
$project = Join-Path $PSScriptRoot "..\..\src\engine\PowerGit.Engine\PowerGit.Engine.csproj"
& $dotnet run --project $project --urls "http://127.0.0.1:7733"

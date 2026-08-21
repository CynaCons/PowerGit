# Builds and runs the Ubuntu smoke-check container against this repo.
# Requires Docker Desktop. Read-only repo mount; results print to console.
$ErrorActionPreference = "Stop"

$repo = (Resolve-Path "$PSScriptRoot\..").Path
docker build -t powergit-ubuntu-check "$repo\docker\ubuntu-check"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker run --rm -v "${repo}:/repo" powergit-ubuntu-check
exit $LASTEXITCODE
